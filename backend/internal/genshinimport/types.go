package genshinimport

import (
	"encoding/json"
	"slices"
)

const (
	LocaleEnglish = "en_US"
	LocaleRussian = "ru_RU"
)

type CharacterLocalization struct {
	Name        string
	Title       string
	Description string
}

type TalentLocalization struct {
	Name        string
	Description string
}

type Talent struct {
	ExternalKey   string
	Kind          string
	DisplayOrder  int16
	IconFilename  string
	Scaling       json.RawMessage
	Payload       json.RawMessage
	Localizations map[string]TalentLocalization
}

type Constellation struct {
	ExternalKey   string
	Position      int16
	IconFilename  string
	Payload       json.RawMessage
	Localizations map[string]TalentLocalization
}

type Character struct {
	ExternalID       int32
	Slug             string
	Rarity           int16
	Element          string
	WeaponType       string
	Region           string
	BodyType         string
	BirthdayMonth    *int16
	BirthdayDay      *int16
	IconFilename     string
	PortraitFilename string
	Payload          json.RawMessage
	Localizations    map[string]CharacterLocalization
	Talents          []Talent
	Constellations   []Constellation
}

type WeaponLocalization struct {
	Name                   string
	Description            string
	PassiveName            string
	PassiveDescription     string
	RefinementDescriptions []string
}

type Weapon struct {
	ExternalID         int32
	Slug               string
	Rarity             int16
	WeaponType         string
	BaseAttack         *float64
	SecondaryStat      string
	SecondaryStatValue *float64
	IconFilename       string
	Payload            json.RawMessage
	Localizations      map[string]WeaponLocalization
}

type ArtifactPieceLocalization struct {
	Name        string
	Description string
}

type ArtifactPiece struct {
	Slot          string
	IconFilename  string
	Payload       json.RawMessage
	Localizations map[string]ArtifactPieceLocalization
}

type ArtifactSetLocalization struct {
	Name           string
	TwoPieceBonus  string
	FourPieceBonus string
}

type ArtifactSet struct {
	ExternalID    int32
	Slug          string
	MinRarity     int16
	MaxRarity     int16
	IconFilename  string
	Payload       json.RawMessage
	Localizations map[string]ArtifactSetLocalization
	Pieces        []ArtifactPiece
}

// ContentMedia is an image referenced by a source record. The role preserves
// the original manifest key (for example filename_icon or filename_cardface)
// so clients can choose the right presentation without losing source detail.
type ContentMedia struct {
	Role     string
	Filename string
}

// ContentLocalization keeps the complete localized source record. The typed
// tables above provide optimized views for the core catalogue, while these
// records retain every other genshin-db category without throwing fields away.
type ContentLocalization struct {
	Name        string
	Description string
	Payload     json.RawMessage
}

type ContentEntry struct {
	Category      string
	Slug          string
	ExternalID    *int64
	IconFilename  string
	Media         []ContentMedia
	Payload       json.RawMessage
	Localizations map[string]ContentLocalization
}

// SupplementalSource identifies an additive dataset layered on top of the
// primary genshin-db checkout. The digest makes a locally cached fetch
// reproducible without exposing the server's filesystem layout.
type SupplementalSource struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	FetchedAt string `json:"fetchedAt,omitempty"`
}

type Dataset struct {
	Characters          []Character
	Weapons             []Weapon
	ArtifactSets        []ArtifactSet
	Content             []ContentEntry
	SupplementalSources []SupplementalSource
}

type Counts struct {
	Characters        int            `json:"characters"`
	Weapons           int            `json:"weapons"`
	ArtifactSets      int            `json:"artifactSets"`
	ArtifactPieces    int            `json:"artifactPieces"`
	Talents           int            `json:"talents"`
	Constellations    int            `json:"constellations"`
	ContentEntries    int            `json:"contentEntries"`
	ContentByCategory map[string]int `json:"contentByCategory,omitempty"`
	MediaAssets       int            `json:"mediaAssets"`
}

func (d Dataset) Counts() Counts {
	counts := Counts{Characters: len(d.Characters), Weapons: len(d.Weapons), ArtifactSets: len(d.ArtifactSets), ContentEntries: len(d.Content), ContentByCategory: make(map[string]int)}
	for _, character := range d.Characters {
		counts.Talents += len(character.Talents)
		counts.Constellations += len(character.Constellations)
	}
	for _, artifact := range d.ArtifactSets {
		counts.ArtifactPieces += len(artifact.Pieces)
	}
	for _, entry := range d.Content {
		counts.ContentByCategory[entry.Category]++
	}
	return counts
}

func (d Dataset) MediaFilenames() []string {
	unique := make(map[string]struct{})
	add := func(filename string) {
		if filename != "" {
			unique[filename] = struct{}{}
		}
	}
	for _, character := range d.Characters {
		add(character.IconFilename)
		add(character.PortraitFilename)
		for _, talent := range character.Talents {
			add(talent.IconFilename)
		}
		for _, constellation := range character.Constellations {
			add(constellation.IconFilename)
		}
	}
	for _, weapon := range d.Weapons {
		add(weapon.IconFilename)
	}
	for _, artifact := range d.ArtifactSets {
		add(artifact.IconFilename)
		for _, piece := range artifact.Pieces {
			add(piece.IconFilename)
		}
	}
	filenames := make([]string, 0, len(unique))
	for filename := range unique {
		filenames = append(filenames, filename)
	}
	slices.Sort(filenames)
	return filenames
}

// OptionalMediaFilenames returns every best-effort image referenced by generic
// source records. Some genshin-db image manifests refer to client-only TCG
// and codex assets that the public provider does not expose; those references
// remain in source_payload while available images are still cached locally.
func (d Dataset) OptionalMediaFilenames() []string {
	unique := make(map[string]struct{})
	for _, entry := range d.Content {
		for _, media := range entry.Media {
			if media.Filename != "" {
				unique[media.Filename] = struct{}{}
			}
		}
	}
	filenames := make([]string, 0, len(unique))
	for filename := range unique {
		filenames = append(filenames, filename)
	}
	slices.Sort(filenames)
	return filenames
}

// MediaFallbacks returns conservative, semantically related fallbacks for
// upstream image manifests that reference assets not yet published by the
// media provider. A fallback is only used after the requested image returns
// not found; character artwork always falls back to that character's icon.
func (d Dataset) MediaFallbacks() map[string]string {
	fallbacks := make(map[string]string)
	for _, character := range d.Characters {
		if character.PortraitFilename != character.IconFilename {
			fallbacks[character.PortraitFilename] = character.IconFilename
		}
		for _, talent := range character.Talents {
			if talent.IconFilename != character.IconFilename {
				fallbacks[talent.IconFilename] = character.IconFilename
			}
		}
		for _, constellation := range character.Constellations {
			if constellation.IconFilename != character.IconFilename {
				fallbacks[constellation.IconFilename] = character.IconFilename
			}
		}
	}
	return fallbacks
}

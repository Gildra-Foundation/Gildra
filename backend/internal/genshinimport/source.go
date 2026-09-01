package genshinimport

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
)

type sourceObject struct {
	raw    json.RawMessage
	fields map[string]json.RawMessage
}

type imageManifest map[string]map[string]string

func LoadSource(root string) (Dataset, error) {
	return LoadSourceWithOverlay(root, "")
}

// LoadSourceWithOverlay loads the primary genshin-db checkout and an optional
// source overlay. The overlay uses the same src/data layout and is intended
// for additive datasets (for example the event calendar) that the primary
// project deliberately does not ship.
func LoadSourceWithOverlay(root, overlay string) (Dataset, error) {
	if root == "" {
		return Dataset{}, errors.New("genshin source directory is required")
	}
	characters, err := loadLocalizedObjects(root, "characters")
	if err != nil {
		return Dataset{}, err
	}
	talents, err := loadLocalizedObjects(root, "talents")
	if err != nil {
		return Dataset{}, err
	}
	constellations, err := loadLocalizedObjects(root, "constellations")
	if err != nil {
		return Dataset{}, err
	}
	weapons, err := loadLocalizedObjects(root, "weapons")
	if err != nil {
		return Dataset{}, err
	}
	artifacts, err := loadLocalizedObjects(root, "artifacts")
	if err != nil {
		return Dataset{}, err
	}
	characterImages, err := loadImageManifest(root, "characters")
	if err != nil {
		return Dataset{}, err
	}
	talentImages, err := loadImageManifest(root, "talents")
	if err != nil {
		return Dataset{}, err
	}
	constellationImages, err := loadImageManifest(root, "constellations")
	if err != nil {
		return Dataset{}, err
	}
	weaponImages, err := loadImageManifest(root, "weapons")
	if err != nil {
		return Dataset{}, err
	}
	artifactImages, err := loadImageManifest(root, "artifacts")
	if err != nil {
		return Dataset{}, err
	}
	content, err := loadAllContent(root, overlay)
	if err != nil {
		return Dataset{}, err
	}

	dataset := Dataset{}
	dataset.Content = content
	dataset.SupplementalSources = loadSupplementalSources(overlay)
	characterSlugs := sortedKeys(characters[LocaleEnglish])
	for _, slug := range characterSlugs {
		character, err := buildCharacter(slug, characters, talents, constellations, characterImages, talentImages, constellationImages)
		if err != nil {
			return Dataset{}, err
		}
		dataset.Characters = append(dataset.Characters, character)
	}
	for _, slug := range sortedKeys(talents[LocaleEnglish]) {
		if _, exists := characters[LocaleEnglish][slug]; exists {
			continue
		}
		character, err := buildTravelerForm(slug, characters, talents, constellations, characterImages, talentImages, constellationImages)
		if err != nil {
			return Dataset{}, err
		}
		dataset.Characters = append(dataset.Characters, character)
	}
	slices.SortFunc(dataset.Characters, func(a, b Character) int { return strings.Compare(a.Slug, b.Slug) })

	for _, slug := range sortedKeys(weapons[LocaleEnglish]) {
		weapon, err := buildWeapon(slug, weapons, weaponImages)
		if err != nil {
			return Dataset{}, err
		}
		dataset.Weapons = append(dataset.Weapons, weapon)
	}
	for _, slug := range sortedKeys(artifacts[LocaleEnglish]) {
		artifact, err := buildArtifactSet(slug, artifacts, artifactImages)
		if err != nil {
			return Dataset{}, err
		}
		dataset.ArtifactSets = append(dataset.ArtifactSets, artifact)
	}
	if err := validateDataset(dataset); err != nil {
		return Dataset{}, err
	}
	return dataset, nil
}

// loadAllContent preserves every genshin-db category in a release. The
// optimized character/weapon/artifact projections are still built below, but
// this generic layer prevents newer or less common categories from being lost
// when the source adds fields or folders.
func loadAllContent(root string, overlay string) ([]ContentEntry, error) {
	roots := []string{root}
	if overlay != "" {
		roots = append(roots, overlay)
	}
	folders := make(map[string]struct{})
	for _, sourceRoot := range roots {
		englishRoot := filepath.Join(sourceRoot, "src", "data", "English")
		entries, err := os.ReadDir(englishRoot)
		if errors.Is(err, os.ErrNotExist) && sourceRoot != root {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("list genshin source categories: %w", err)
		}
		for _, entry := range entries {
			if entry.IsDir() {
				folders[entry.Name()] = struct{}{}
			}
		}
	}
	result := make([]ContentEntry, 0)
	for _, folder := range sortedKeys(folders) {
		localized, err := loadMergedLocalizedObjects(roots, folder)
		if err != nil {
			return nil, err
		}
		images, err := loadMergedGenericImageManifest(roots, folder)
		if err != nil {
			return nil, err
		}
		for _, slug := range sortedKeys(localized[LocaleEnglish]) {
			english := localized[LocaleEnglish][slug]
			russian, exists := localized[LocaleRussian][slug]
			if !exists {
				return nil, fmt.Errorf("%s %q is missing Russian localization", folder, slug)
			}
			name := optionalString(english, "name")
			if name == "" {
				name = slug
			}
			russianLocalization := contentLocalization(russian, slug)
			if folder == "rarity" {
				russianLocalization.Name = rarityRussianName(slug, russianLocalization.Name)
			}
			entry := ContentEntry{
				Category:   folder,
				Slug:       slug,
				ExternalID: optionalExternalID(english),
				Media:      flattenContentMedia(images[slug]),
				Payload:    english.raw,
				Localizations: map[string]ContentLocalization{
					LocaleEnglish: {Name: name, Description: optionalString(english, "description"), Payload: english.raw},
					LocaleRussian: russianLocalization,
				},
			}
			if len(entry.Media) == 0 {
				entry.Media = derivedContentMedia(folder, english)
			}
			if len(entry.Media) > 0 {
				entry.IconFilename = entry.Media[0].Filename
			}
			result = append(result, entry)
		}
	}
	if err := appendSystemContent(root, &result); err != nil {
		return nil, err
	}
	slices.SortFunc(result, func(a, b ContentEntry) int {
		if category := strings.Compare(a.Category, b.Category); category != 0 {
			return category
		}
		return strings.Compare(a.Slug, b.Slug)
	})
	return result, nil
}

func loadMergedLocalizedObjects(roots []string, folder string) (map[string]map[string]sourceObject, error) {
	result := map[string]map[string]sourceObject{
		LocaleEnglish: make(map[string]sourceObject),
		LocaleRussian: make(map[string]sourceObject),
	}
	for _, root := range roots {
		localized, err := loadLocalizedObjectsAllowFallback(root, folder)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) || strings.Contains(err.Error(), "no such file or directory") {
				continue
			}
			return nil, err
		}
		maps.Copy(result[LocaleEnglish], localized[LocaleEnglish])
		maps.Copy(result[LocaleRussian], localized[LocaleRussian])
	}
	if len(result[LocaleEnglish]) == 0 {
		return nil, fmt.Errorf("genshin source category %q contains no English records", folder)
	}
	if err := requireSameSlugs(folder, result[LocaleEnglish], result[LocaleRussian]); err != nil {
		return nil, err
	}
	return result, nil
}

func loadMergedGenericImageManifest(roots []string, folder string) (genericImageManifest, error) {
	result := make(genericImageManifest)
	for _, root := range roots {
		manifest, err := loadGenericImageManifest(root, folder)
		if err != nil {
			return nil, err
		}
		for slug, fields := range manifest {
			if result[slug] == nil {
				result[slug] = make(map[string]json.RawMessage)
			}
			maps.Copy(result[slug], fields)
		}
	}
	return result, nil
}

func loadSupplementalSources(overlay string) []SupplementalSource {
	if overlay == "" {
		return nil
	}
	content, err := os.ReadFile(filepath.Join(overlay, "manifest.json"))
	if err != nil {
		return nil
	}
	var source SupplementalSource
	if json.Unmarshal(content, &source) != nil || source.URL == "" || source.SHA256 == "" {
		return nil
	}
	if source.Name == "" {
		source.Name = "supplemental"
	}
	return []SupplementalSource{source}
}

// derivedContentMedia fills the one source category whose client icon can be
// derived from its stable item id even though genshin-db has no image manifest.
// The local mirror contains the available UI_ItemIcon files; unavailable ids
// remain source-only and do not block publication.
func derivedContentMedia(category string, object sourceObject) []ContentMedia {
	if category != "crafts" {
		return nil
	}
	id := requiredInt(object, "id")
	if id <= 0 {
		return nil
	}
	return []ContentMedia{{Role: "derived_icon", Filename: "UI_ItemIcon_" + strconv.Itoa(id+100000)}}
}

// stats and curves are shipped outside the localized entity folders. Keep
// those files as first-class source records so weapon, character, enemy and
// talent progression data is queryable instead of being silently discarded.
func appendSystemContent(root string, result *[]ContentEntry) error {
	for _, source := range []struct {
		category  string
		directory string
	}{
		{category: "stats", directory: "stats"},
		{category: "curves", directory: "curve"},
	} {
		category := source.category
		directory := filepath.Join(root, "src", "data", source.directory)
		files, err := os.ReadDir(directory)
		if err != nil {
			return fmt.Errorf("list genshin %s source files: %w", category, err)
		}
		for _, file := range files {
			if file.IsDir() || filepath.Ext(file.Name()) != ".json" {
				continue
			}
			content, err := os.ReadFile(filepath.Join(directory, file.Name()))
			if err != nil {
				return fmt.Errorf("read genshin %s/%s: %w", category, file.Name(), err)
			}
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(content, &fields); err != nil {
				return fmt.Errorf("decode genshin %s/%s: %w", category, file.Name(), err)
			}
			slug := strings.TrimSuffix(file.Name(), ".json")
			name := strings.ToUpper(category[:1]) + category[1:] + ": " + slug
			*result = append(*result, ContentEntry{
				Category: category,
				Slug:     slug,
				Payload:  bytes.Clone(content),
				Localizations: map[string]ContentLocalization{
					LocaleEnglish: {Name: name, Payload: bytes.Clone(content)},
					LocaleRussian: {Name: name, Payload: bytes.Clone(content)},
				},
			})
		}
	}
	return nil
}

func loadLocalizedObjectsAllowFallback(root, folder string) (map[string]map[string]sourceObject, error) {
	result := make(map[string]map[string]sourceObject, 2)
	english, err := loadObjectDirectory(filepath.Join(root, "src", "data", "English", folder))
	if err != nil {
		return nil, fmt.Errorf("load English %s: %w", folder, err)
	}
	russianDirectory := filepath.Join(root, "src", "data", "Russian", folder)
	russian, err := loadObjectDirectory(russianDirectory)
	if errors.Is(err, os.ErrNotExist) {
		// A few source-only enums (currently rarity) are language-neutral. Keep
		// their complete payload and provide an explicit localized display name.
		russian = make(map[string]sourceObject, len(english))
		maps.Copy(russian, english)
	} else if err != nil {
		return nil, fmt.Errorf("load Russian %s: %w", folder, err)
	}
	if err := requireSameSlugs(folder, english, russian); err != nil {
		return nil, err
	}
	result[LocaleEnglish] = english
	result[LocaleRussian] = russian
	return result, nil
}

type genericImageManifest map[string]map[string]json.RawMessage

func loadGenericImageManifest(root, folder string) (genericImageManifest, error) {
	content, err := os.ReadFile(filepath.Join(root, "src", "data", "image", folder+".json"))
	if errors.Is(err, os.ErrNotExist) {
		return genericImageManifest{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s generic image manifest: %w", folder, err)
	}
	var manifest genericImageManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return nil, fmt.Errorf("decode %s generic image manifest: %w", folder, err)
	}
	return manifest, nil
}

func flattenContentMedia(fields map[string]json.RawMessage) []ContentMedia {
	if len(fields) == 0 {
		return nil
	}
	roles := sortedKeys(fields)
	slices.SortStableFunc(roles, func(a, b string) int {
		if rank := contentMediaRoleRank(a) - contentMediaRoleRank(b); rank != 0 {
			return rank
		}
		return strings.Compare(a, b)
	})
	result := make([]ContentMedia, 0, len(roles))
	seen := make(map[string]struct{})
	for _, role := range roles {
		if role == "base64" || strings.HasPrefix(role, "data:") {
			continue
		}
		var values []string
		var value string
		if json.Unmarshal(fields[role], &value) == nil {
			values = []string{value}
		} else if json.Unmarshal(fields[role], &values) != nil {
			continue
		}
		for index, filename := range values {
			filename = strings.TrimSpace(filename)
			if filename == "" || strings.HasPrefix(filename, "data:") {
				continue
			}
			if _, exists := seen[filename]; exists {
				continue
			}
			seen[filename] = struct{}{}
			mediaRole := role
			if len(values) > 1 {
				mediaRole = fmt.Sprintf("%s[%d]", role, index)
			}
			result = append(result, ContentMedia{Role: mediaRole, Filename: filename})
		}
	}
	return result
}

func contentMediaRoleRank(role string) int {
	switch role {
	case "filename_icon":
		return 0
	case "filename_cardface":
		return 1
	case "filename_image":
		return 2
	case "filename_card":
		return 3
	case "filename_splash":
		return 4
	case "filename_background":
		return 5
	case "filename_iconCircle":
		return 6
	case "filename_gacha":
		return 7
	default:
		return 10
	}
}

func contentLocalization(object sourceObject, fallbackSlug string) ContentLocalization {
	name := optionalString(object, "name")
	if name == "" {
		name = fallbackSlug
	}
	return ContentLocalization{Name: name, Description: optionalString(object, "description"), Payload: object.raw}
}

func optionalExternalID(object sourceObject) *int64 {
	raw, ok := object.fields["id"]
	if !ok {
		return nil
	}
	var value int64
	if json.Unmarshal(raw, &value) == nil && value != 0 {
		return &value
	}
	var values []int64
	if json.Unmarshal(raw, &values) == nil && len(values) > 0 && values[0] != 0 {
		return &values[0]
	}
	var textValue string
	if json.Unmarshal(raw, &textValue) == nil {
		if parsed, err := strconv.ParseInt(textValue, 10, 64); err == nil && parsed != 0 {
			return &parsed
		}
	}
	return nil
}

func rarityRussianName(slug, fallback string) string {
	switch slug {
	case "onestar":
		return "Одна звезда"
	case "twostar":
		return "Две звезды"
	case "threestar":
		return "Три звезды"
	case "fourstar":
		return "Четыре звезды"
	case "fivestar":
		return "Пять звёзд"
	default:
		return fallback
	}
}

func loadLocalizedObjects(root, folder string) (map[string]map[string]sourceObject, error) {
	result := make(map[string]map[string]sourceObject, 2)
	for locale, sourceLocale := range map[string]string{LocaleEnglish: "English", LocaleRussian: "Russian"} {
		objects, err := loadObjectDirectory(filepath.Join(root, "src", "data", sourceLocale, folder))
		if err != nil {
			return nil, fmt.Errorf("load %s %s: %w", sourceLocale, folder, err)
		}
		result[locale] = objects
	}
	if err := requireSameSlugs(folder, result[LocaleEnglish], result[LocaleRussian]); err != nil {
		return nil, err
	}
	return result, nil
}

func loadObjectDirectory(directory string) (map[string]sourceObject, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, err
	}
	objects := make(map[string]sourceObject, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		slug := strings.TrimSuffix(entry.Name(), ".json")
		content, err := os.ReadFile(filepath.Join(directory, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", entry.Name(), err)
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(content, &fields); err != nil {
			return nil, fmt.Errorf("decode %s: %w", entry.Name(), err)
		}
		objects[slug] = sourceObject{raw: bytes.Clone(content), fields: fields}
	}
	if len(objects) == 0 {
		return nil, fmt.Errorf("directory %q contains no JSON records", directory)
	}
	return objects, nil
}

func loadImageManifest(root, folder string) (imageManifest, error) {
	content, err := os.ReadFile(filepath.Join(root, "src", "data", "image", folder+".json"))
	if err != nil {
		return nil, fmt.Errorf("read %s image manifest: %w", folder, err)
	}
	var manifest imageManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return nil, fmt.Errorf("decode %s image manifest: %w", folder, err)
	}
	return manifest, nil
}

func buildCharacter(
	slug string,
	characters, talents, constellations map[string]map[string]sourceObject,
	characterImages, talentImages, constellationImages imageManifest,
) (Character, error) {
	english := characters[LocaleEnglish][slug]
	russian := characters[LocaleRussian][slug]
	externalID, err := requiredInt32(english, "id")
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	element, err := characterElement(requiredString(english, "elementType"))
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	weaponType, err := weaponType(requiredString(english, "weaponType"))
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	month, day, err := birthday(optionalString(english, "birthdaymmdd"))
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	images := characterImages[slug]
	icon, err := requiredImage(images, "filename_icon")
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	portrait, err := requiredImage(images, "filename_iconCard")
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	character := Character{
		ExternalID:       externalID,
		Slug:             slug,
		Rarity:           int16(requiredInt(english, "rarity")),
		Element:          element,
		WeaponType:       weaponType,
		Region:           optionalString(english, "region"),
		BodyType:         strings.ToLower(strings.TrimPrefix(optionalString(english, "bodyType"), "BODY_")),
		BirthdayMonth:    month,
		BirthdayDay:      day,
		IconFilename:     icon,
		PortraitFilename: portrait,
		Payload:          english.raw,
		Localizations: map[string]CharacterLocalization{
			LocaleEnglish: characterLocalization(english),
			LocaleRussian: characterLocalization(russian),
		},
	}
	if _, exists := talents[LocaleEnglish][slug]; exists {
		character.Talents, err = buildTalents(slug, talents, talentImages)
		if err != nil {
			return Character{}, err
		}
	}
	if _, exists := constellations[LocaleEnglish][slug]; exists {
		character.Constellations, err = buildConstellations(slug, constellations, constellationImages)
		if err != nil {
			return Character{}, err
		}
	}
	return character, nil
}

func buildTravelerForm(
	slug string,
	characters, talents, constellations map[string]map[string]sourceObject,
	characterImages, talentImages, constellationImages imageManifest,
) (Character, error) {
	if !strings.HasPrefix(slug, "traveler") {
		return Character{}, fmt.Errorf("talent record %q has no matching character", slug)
	}
	element, ok := strings.CutPrefix(slug, "traveler")
	if !ok || !validElement(element) || element == "none" {
		return Character{}, fmt.Errorf("traveler record %q has invalid element", slug)
	}
	englishTalent := talents[LocaleEnglish][slug]
	russianTalent := talents[LocaleRussian][slug]
	talentID := requiredInt(englishTalent, "id")
	baseEnglish, ok := characters[LocaleEnglish]["aether"]
	if !ok {
		return Character{}, errors.New("aether source record is required for traveler forms")
	}
	baseRussian := characters[LocaleRussian]["aether"]
	images := characterImages["aether"]
	icon, err := requiredImage(images, "filename_icon")
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	portrait, err := requiredImage(images, "filename_iconCard")
	if err != nil {
		return Character{}, fieldError("character", slug, err)
	}
	talentList, err := buildTalents(slug, talents, talentImages)
	if err != nil {
		return Character{}, err
	}
	constellationList := []Constellation(nil)
	if _, exists := constellations[LocaleEnglish][slug]; exists {
		constellationList, err = buildConstellations(slug, constellations, constellationImages)
		if err != nil {
			return Character{}, err
		}
	}
	payload, err := json.Marshal(map[string]any{"syntheticTravelerForm": true, "talentSource": json.RawMessage(englishTalent.raw)})
	if err != nil {
		return Character{}, fmt.Errorf("encode traveler payload %q: %w", slug, err)
	}
	return Character{
		ExternalID:       int32(100_000_000 + talentID),
		Slug:             slug,
		Rarity:           5,
		Element:          element,
		WeaponType:       "sword",
		BodyType:         "traveler",
		IconFilename:     icon,
		PortraitFilename: portrait,
		Payload:          payload,
		Localizations: map[string]CharacterLocalization{
			LocaleEnglish: {Name: requiredString(englishTalent, "name"), Description: optionalString(baseEnglish, "description")},
			LocaleRussian: {Name: requiredString(russianTalent, "name"), Description: optionalString(baseRussian, "description")},
		},
		Talents:        talentList,
		Constellations: constellationList,
	}, nil
}

func buildTalents(slug string, localized map[string]map[string]sourceObject, images imageManifest) ([]Talent, error) {
	english := localized[LocaleEnglish][slug]
	russian := localized[LocaleRussian][slug]
	imageFields := images[slug]
	keys := []struct {
		name string
		kind string
	}{
		{name: "combat1", kind: "normal_attack"},
		{name: "combat2", kind: "elemental_skill"},
		{name: "combat3", kind: "elemental_burst"},
		{name: "combat4", kind: "alternate_sprint"},
		{name: "passive1", kind: "passive"},
		{name: "passive2", kind: "passive"},
		{name: "passive3", kind: "passive"},
		{name: "passive4", kind: "passive"},
	}
	result := make([]Talent, 0, len(keys))
	for index, key := range keys {
		englishSkill, exists := objectField(english, key.name)
		if !exists || optionalString(englishSkill, "name") == "" {
			continue
		}
		russianSkill, exists := objectField(russian, key.name)
		if !exists {
			return nil, fmt.Errorf("talent %q %s is missing Russian localization", slug, key.name)
		}
		icon, err := requiredImage(imageFields, "filename_"+key.name)
		if err != nil {
			return nil, fieldError("talent", slug+"/"+key.name, err)
		}
		scaling := json.RawMessage(`[]`)
		if value, ok := englishSkill.fields["attributes"]; ok {
			scaling = bytes.Clone(value)
		}
		result = append(result, Talent{
			ExternalKey:  key.name,
			Kind:         key.kind,
			DisplayOrder: int16(index),
			IconFilename: icon,
			Scaling:      scaling,
			Payload:      englishSkill.raw,
			Localizations: map[string]TalentLocalization{
				LocaleEnglish: talentLocalization(englishSkill),
				LocaleRussian: talentLocalization(russianSkill),
			},
		})
	}
	return result, nil
}

func buildConstellations(slug string, localized map[string]map[string]sourceObject, images imageManifest) ([]Constellation, error) {
	english := localized[LocaleEnglish][slug]
	russian := localized[LocaleRussian][slug]
	imageFields := images[slug]
	result := make([]Constellation, 0, 6)
	for position := 1; position <= 6; position++ {
		key := "c" + strconv.Itoa(position)
		englishItem, exists := objectField(english, key)
		if !exists {
			continue
		}
		russianItem, exists := objectField(russian, key)
		if !exists {
			return nil, fmt.Errorf("constellation %q %s is missing Russian localization", slug, key)
		}
		icon, err := requiredImage(imageFields, "filename_"+key)
		if err != nil {
			return nil, fieldError("constellation", slug+"/"+key, err)
		}
		result = append(result, Constellation{
			ExternalKey:  key,
			Position:     int16(position),
			IconFilename: icon,
			Payload:      englishItem.raw,
			Localizations: map[string]TalentLocalization{
				LocaleEnglish: talentLocalization(englishItem),
				LocaleRussian: talentLocalization(russianItem),
			},
		})
	}
	return result, nil
}

func buildWeapon(slug string, localized map[string]map[string]sourceObject, images imageManifest) (Weapon, error) {
	english := localized[LocaleEnglish][slug]
	russian := localized[LocaleRussian][slug]
	externalID, err := requiredInt32(english, "id")
	if err != nil {
		return Weapon{}, fieldError("weapon", slug, err)
	}
	typeValue, err := weaponType(requiredString(english, "weaponType"))
	if err != nil {
		return Weapon{}, fieldError("weapon", slug, err)
	}
	icon, err := requiredImage(images[slug], "filename_icon")
	if err != nil {
		return Weapon{}, fieldError("weapon", slug, err)
	}
	return Weapon{
		ExternalID:         externalID,
		Slug:               slug,
		Rarity:             int16(requiredInt(english, "rarity")),
		WeaponType:         typeValue,
		BaseAttack:         optionalFloat(english, "baseAtkValue"),
		SecondaryStat:      optionalString(english, "mainStatText"),
		SecondaryStatValue: parseNumericText(optionalString(english, "baseStatText")),
		IconFilename:       icon,
		Payload:            english.raw,
		Localizations: map[string]WeaponLocalization{
			LocaleEnglish: weaponLocalization(english),
			LocaleRussian: weaponLocalization(russian),
		},
	}, nil
}

func buildArtifactSet(slug string, localized map[string]map[string]sourceObject, images imageManifest) (ArtifactSet, error) {
	english := localized[LocaleEnglish][slug]
	russian := localized[LocaleRussian][slug]
	externalID, err := requiredInt32(english, "id")
	if err != nil {
		return ArtifactSet{}, fieldError("artifact", slug, err)
	}
	rarities, err := intSlice(english, "rarityList")
	if err != nil || len(rarities) == 0 {
		return ArtifactSet{}, fieldError("artifact", slug, errors.New("rarityList is required"))
	}
	slices.Sort(rarities)
	pieceFields := []struct{ key, slot string }{
		{key: "flower", slot: "flower"},
		{key: "plume", slot: "plume"},
		{key: "sands", slot: "sands"},
		{key: "goblet", slot: "goblet"},
		{key: "circlet", slot: "circlet"},
	}
	pieces := make([]ArtifactPiece, 0, 5)
	for _, field := range pieceFields {
		englishPiece, exists := objectField(english, field.key)
		if !exists {
			continue
		}
		russianPiece, exists := objectField(russian, field.key)
		if !exists {
			return ArtifactSet{}, fmt.Errorf("artifact %q %s is missing Russian localization", slug, field.key)
		}
		icon, err := requiredImage(images[slug], "filename_"+field.key)
		if err != nil {
			return ArtifactSet{}, fieldError("artifact", slug+"/"+field.key, err)
		}
		pieces = append(pieces, ArtifactPiece{
			Slot:         field.slot,
			IconFilename: icon,
			Payload:      englishPiece.raw,
			Localizations: map[string]ArtifactPieceLocalization{
				LocaleEnglish: pieceLocalization(englishPiece),
				LocaleRussian: pieceLocalization(russianPiece),
			},
		})
	}
	if len(pieces) == 0 {
		return ArtifactSet{}, fmt.Errorf("artifact %q contains no pieces", slug)
	}
	return ArtifactSet{
		ExternalID:   externalID,
		Slug:         slug,
		MinRarity:    int16(rarities[0]),
		MaxRarity:    int16(rarities[len(rarities)-1]),
		IconFilename: pieces[0].IconFilename,
		Payload:      english.raw,
		Localizations: map[string]ArtifactSetLocalization{
			LocaleEnglish: artifactLocalization(english),
			LocaleRussian: artifactLocalization(russian),
		},
		Pieces: pieces,
	}, nil
}

func objectField(object sourceObject, key string) (sourceObject, bool) {
	raw, ok := object.fields[key]
	if !ok || bytes.Equal(raw, []byte("null")) {
		return sourceObject{}, false
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return sourceObject{}, false
	}
	return sourceObject{raw: bytes.Clone(raw), fields: fields}, true
}

func characterLocalization(object sourceObject) CharacterLocalization {
	return CharacterLocalization{Name: requiredString(object, "name"), Title: optionalString(object, "title"), Description: optionalString(object, "description")}
}

func talentLocalization(object sourceObject) TalentLocalization {
	return TalentLocalization{Name: requiredString(object, "name"), Description: optionalString(object, "description")}
}

func weaponLocalization(object sourceObject) WeaponLocalization {
	refinements := make([]string, 0, 5)
	for index := 1; index <= 5; index++ {
		if value := optionalString(object, "r"+strconv.Itoa(index)); value != "" {
			refinements = append(refinements, value)
		}
	}
	return WeaponLocalization{
		Name:                   requiredString(object, "name"),
		Description:            optionalString(object, "description"),
		PassiveName:            optionalString(object, "effectName"),
		PassiveDescription:     optionalString(object, "effectTemplateRaw"),
		RefinementDescriptions: refinements,
	}
}

func artifactLocalization(object sourceObject) ArtifactSetLocalization {
	return ArtifactSetLocalization{Name: requiredString(object, "name"), TwoPieceBonus: optionalString(object, "effect2Pc"), FourPieceBonus: optionalString(object, "effect4Pc")}
}

func pieceLocalization(object sourceObject) ArtifactPieceLocalization {
	return ArtifactPieceLocalization{Name: requiredString(object, "name"), Description: optionalString(object, "description")}
}

func requiredString(object sourceObject, key string) string {
	value := optionalString(object, key)
	return value
}

func optionalString(object sourceObject, key string) string {
	var value string
	if raw, ok := object.fields[key]; ok {
		_ = json.Unmarshal(raw, &value)
	}
	return strings.TrimSpace(value)
}

func requiredInt(object sourceObject, key string) int {
	var value int
	if raw, ok := object.fields[key]; ok {
		_ = json.Unmarshal(raw, &value)
	}
	return value
}

func requiredInt32(object sourceObject, key string) (int32, error) {
	value := requiredInt(object, key)
	if value <= 0 || int64(value) > int64(^uint32(0)>>1) {
		return 0, fmt.Errorf("%s must be a positive 32-bit integer", key)
	}
	return int32(value), nil
}

func optionalFloat(object sourceObject, key string) *float64 {
	raw, ok := object.fields[key]
	if !ok {
		return nil
	}
	var value float64
	if json.Unmarshal(raw, &value) != nil {
		return nil
	}
	return &value
}

func intSlice(object sourceObject, key string) ([]int, error) {
	var values []int
	if err := json.Unmarshal(object.fields[key], &values); err != nil {
		return nil, err
	}
	return values, nil
}

func parseNumericText(value string) *float64 {
	value = strings.TrimSpace(strings.TrimSuffix(value, "%"))
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func birthday(value string) (*int16, *int16, error) {
	if value == "" || value == "0/0" {
		return nil, nil, nil
	}
	parts := strings.Split(value, "/")
	if len(parts) != 2 {
		return nil, nil, fmt.Errorf("invalid birthday %q", value)
	}
	month, err := strconv.Atoi(parts[0])
	if err != nil || month < 1 || month > 12 {
		return nil, nil, fmt.Errorf("invalid birthday month %q", value)
	}
	day, err := strconv.Atoi(parts[1])
	if err != nil || day < 1 || day > 31 {
		return nil, nil, fmt.Errorf("invalid birthday day %q", value)
	}
	monthValue, dayValue := int16(month), int16(day)
	return &monthValue, &dayValue, nil
}

func characterElement(value string) (string, error) {
	element := strings.ToLower(strings.TrimPrefix(value, "ELEMENT_"))
	if !validElement(element) {
		return "", fmt.Errorf("unsupported element %q", value)
	}
	return element, nil
}

func validElement(value string) bool {
	switch value {
	case "none", "anemo", "geo", "electro", "dendro", "hydro", "pyro", "cryo":
		return true
	default:
		return false
	}
}

func weaponType(value string) (string, error) {
	switch value {
	case "WEAPON_SWORD_ONE_HAND":
		return "sword", nil
	case "WEAPON_CLAYMORE":
		return "claymore", nil
	case "WEAPON_POLE":
		return "polearm", nil
	case "WEAPON_BOW":
		return "bow", nil
	case "WEAPON_CATALYST":
		return "catalyst", nil
	default:
		return "", fmt.Errorf("unsupported weapon type %q", value)
	}
}

func requiredImage(fields map[string]string, key string) (string, error) {
	value := strings.TrimSpace(fields[key])
	if value == "" {
		return "", fmt.Errorf("image field %s is required", key)
	}
	return value, nil
}

func requireSameSlugs(folder string, english, russian map[string]sourceObject) error {
	for slug := range english {
		if _, exists := russian[slug]; !exists {
			return fmt.Errorf("%s %q is missing Russian localization", folder, slug)
		}
	}
	for slug := range russian {
		if _, exists := english[slug]; !exists {
			return fmt.Errorf("%s %q is missing English localization", folder, slug)
		}
	}
	return nil
}

func validateDataset(dataset Dataset) error {
	if len(dataset.Characters) == 0 || len(dataset.Weapons) == 0 || len(dataset.ArtifactSets) == 0 {
		return errors.New("genshin dataset must contain characters, weapons and artifact sets")
	}
	characterIDs := make(map[int32]string, len(dataset.Characters))
	characterSlugs := make(map[string]struct{}, len(dataset.Characters))
	for _, character := range dataset.Characters {
		if previous := characterIDs[character.ExternalID]; previous != "" {
			return fmt.Errorf("duplicate character external ID %d for %q and %q", character.ExternalID, previous, character.Slug)
		}
		characterIDs[character.ExternalID] = character.Slug
		if _, exists := characterSlugs[character.Slug]; exists {
			return fmt.Errorf("duplicate character slug %q", character.Slug)
		}
		characterSlugs[character.Slug] = struct{}{}
		if err := requireLocales("character", character.Slug, character.Localizations); err != nil {
			return err
		}
		for _, talent := range character.Talents {
			if err := requireLocales("talent", character.Slug+"/"+talent.ExternalKey, talent.Localizations); err != nil {
				return err
			}
		}
		for _, constellation := range character.Constellations {
			if err := requireLocales("constellation", character.Slug+"/"+constellation.ExternalKey, constellation.Localizations); err != nil {
				return err
			}
		}
	}
	weaponIDs := make(map[int32]string, len(dataset.Weapons))
	for _, weapon := range dataset.Weapons {
		if previous := weaponIDs[weapon.ExternalID]; previous != "" {
			return fmt.Errorf("duplicate weapon external ID %d for %q and %q", weapon.ExternalID, previous, weapon.Slug)
		}
		weaponIDs[weapon.ExternalID] = weapon.Slug
		if err := requireLocales("weapon", weapon.Slug, weapon.Localizations); err != nil {
			return err
		}
	}
	artifactIDs := make(map[int32]string, len(dataset.ArtifactSets))
	for _, artifact := range dataset.ArtifactSets {
		if previous := artifactIDs[artifact.ExternalID]; previous != "" {
			return fmt.Errorf("duplicate artifact external ID %d for %q and %q", artifact.ExternalID, previous, artifact.Slug)
		}
		artifactIDs[artifact.ExternalID] = artifact.Slug
		if err := requireLocales("artifact", artifact.Slug, artifact.Localizations); err != nil {
			return err
		}
		for _, piece := range artifact.Pieces {
			if err := requireLocales("artifact piece", artifact.Slug+"/"+piece.Slot, piece.Localizations); err != nil {
				return err
			}
		}
	}
	contentKeys := make(map[string]struct{}, len(dataset.Content))
	for _, entry := range dataset.Content {
		if entry.Category == "" || entry.Slug == "" {
			return errors.New("generic genshin content requires category and slug")
		}
		key := entry.Category + "\x00" + entry.Slug
		if _, exists := contentKeys[key]; exists {
			return fmt.Errorf("duplicate generic genshin content %s/%s", entry.Category, entry.Slug)
		}
		contentKeys[key] = struct{}{}
		if err := requireLocales("content", entry.Category+"/"+entry.Slug, entry.Localizations); err != nil {
			return err
		}
		for _, media := range entry.Media {
			if media.Role == "" || media.Filename == "" {
				return fmt.Errorf("content %s/%s contains invalid media reference", entry.Category, entry.Slug)
			}
		}
	}
	return nil
}

func requireLocales[T any](kind, key string, localizations map[string]T) error {
	if _, exists := localizations[LocaleEnglish]; !exists {
		return fmt.Errorf("%s %q is missing English localization", kind, key)
	}
	if _, exists := localizations[LocaleRussian]; !exists {
		return fmt.Errorf("%s %q is missing Russian localization", kind, key)
	}
	return nil
}

func fieldError(kind, key string, err error) error {
	return fmt.Errorf("%s %q: %w", kind, key, err)
}

func sortedKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

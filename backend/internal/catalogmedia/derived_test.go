package catalogmedia

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"slices"
	"strings"
	"testing"
)

func TestNormalizeDerivedGroups(t *testing.T) {
	t.Parallel()
	groups, err := normalizeDerivedGroups(nil)
	if err != nil || !slices.Equal(groups, DefaultDerivedMediaGroups) {
		t.Fatalf("default groups=%v err=%v", groups, err)
	}
	groups, err = normalizeDerivedGroups([]string{"default", "quest_reward_package_item_icon", "item_appearance_icon"})
	if err != nil || len(groups) != len(DefaultDerivedMediaGroups)+1 || groups[len(groups)-1] != "quest_reward_package_item_icon" {
		t.Fatalf("combined groups=%v err=%v", groups, err)
	}
	groups, err = normalizeDerivedGroups([]string{"all"})
	if err != nil || len(groups) != len(DefaultDerivedMediaGroups)+len(OptionalDerivedMediaGroups) {
		t.Fatalf("all groups=%v err=%v", groups, err)
	}
	if _, err := normalizeDerivedGroups([]string{"quests"}); err == nil {
		t.Fatal("unknown group was accepted")
	}
}

func TestDerivedGroupsAreFullyDeclared(t *testing.T) {
	t.Parallel()
	for _, group := range append(append([]string(nil), DefaultDerivedMediaGroups...), OptionalDerivedMediaGroups...) {
		statement, ok := derivedGroupSQL[group]
		if !ok || !strings.Contains(statement, "'"+group+"'") {
			t.Errorf("group %s has no statement inserting its own key", group)
		}
		if derivedGroupEntityTypes[group] == "" {
			t.Errorf("group %s has no entity type", group)
		}
		if _, ok := derivedGroupTables[group]; !ok {
			t.Errorf("group %s does not declare its DB2 tables", group)
		}
		for _, table := range derivedGroupTables[group] {
			if strings.Contains(statement, "derivedEvidenceBuild") || !strings.Contains(statement, "'"+table+"'") {
				t.Errorf("group %s declares table %s it does not read", group, table)
			}
		}
	}
}

func TestTrimTransparentPNGKeepsOnlyArtwork(t *testing.T) {
	t.Parallel()
	canvas := image.NewNRGBA(image.Rect(0, 0, 8, 4))
	for y := 1; y < 3; y++ {
		for x := 2; x < 7; x++ {
			canvas.Set(x, y, color.NRGBA{R: 200, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, canvas); err != nil {
		t.Fatal(err)
	}
	trimmed, width, height, err := trimTransparentPNG(encoded.Bytes())
	if err != nil || width != 5 || height != 2 {
		t.Fatalf("trimmed %dx%d err=%v", width, height, err)
	}
	decoded, err := png.Decode(bytes.NewReader(trimmed))
	if err != nil || decoded.Bounds().Dx() != 5 || decoded.Bounds().Dy() != 2 {
		t.Fatalf("decoded trimmed PNG: %v %v", decoded.Bounds(), err)
	}
	if _, _, _, err := trimTransparentPNG(mustPNG(t, image.NewNRGBA(image.Rect(0, 0, 2, 2)))); err == nil {
		t.Fatal("fully transparent texture was accepted")
	}
}

func TestFetchCreatureDisplayRenderRecordsOfficialAsset(t *testing.T) {
	t.Parallel()
	canvas := image.NewRGBA(image.Rect(0, 0, 6, 3))
	for x := 2; x < 5; x++ {
		canvas.Set(x, 1, color.RGBA{R: 220, G: 180, B: 60, A: 255})
	}
	var picture bytes.Buffer
	if err := jpeg.Encode(&picture, canvas, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != creatureDisplayRenderOrigin+"37410.jpg" {
			t.Fatalf("render URL=%q", request.URL)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(picture.Bytes())), Header: make(http.Header)}, nil
	})}
	root := t.TempDir()
	rootHandle, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = rootHandle.Close() })
	cache := &Cache{rootPath: root, root: rootHandle, client: client}
	icon, err := cache.fetchCreatureDisplayRender(context.Background(), creatureDisplayRenderOrigin+"37410.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if icon.Source != "blizzard_api" || icon.AssetKey != "creature_display_37410_zoom" ||
		icon.ArtifactKey != "npcs/zoom/creature-display-37410.jpg" || icon.Width != 3 || icon.Height != 3 ||
		icon.CachedMIMEType != "image/jpeg" || icon.Conversion != "jpeg_crop_to_model" ||
		bytes.Equal(icon.SourceHash, icon.CachedHash) {
		t.Fatalf("unexpected render asset: %#v", icon)
	}
	for _, foreign := range []string{"https://example.com/creature-display-1.jpg", creatureDisplayRenderOrigin + "x.jpg"} {
		if _, err := cache.fetchCreatureDisplayRender(context.Background(), foreign); err == nil {
			t.Fatalf("render URL %q was accepted", foreign)
		}
	}
}

func TestFetchWagoCASCTextureTrimsJournalButton(t *testing.T) {
	t.Parallel()
	// An uncompressed 4x4 BGRA texture with opaque artwork only in its
	// top-left 2x2 pixels, like a journal button inside its padded canvas.
	pixels := make([]byte, 4*4*4)
	for _, pixel := range []int{0, 1, 4, 5} {
		copy(pixels[pixel*4:], []byte{0, 0, 200, 255})
	}
	raw := syntheticBLP2(3, 8, 0, pixels)
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(raw)), Header: make(http.Header)}, nil
	})}
	root := t.TempDir()
	rootHandle, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = rootHandle.Close() })
	cache := &Cache{rootPath: root, root: rootHandle, client: client}
	texture, err := cache.fetchWagoCASCTexture(context.Background(), 608200, "wow", "12.1.0.69587", true)
	if err != nil {
		t.Fatal(err)
	}
	if texture.Source != "wago_tools" || texture.AssetKey != "wago_casc_texture_png" ||
		texture.Conversion != "blp2_to_png_trimmed" || texture.Width != 2 || texture.Height != 2 ||
		texture.FileDataID == nil || *texture.FileDataID != 608200 {
		t.Fatalf("unexpected texture: %#v", texture)
	}
}

func TestIsBlankRenderRejectsEmptyBackdrop(t *testing.T) {
	t.Parallel()
	backdrop := image.NewRGBA(image.Rect(0, 0, 600, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 600; x++ {
			backdrop.Set(x, y, color.RGBA{R: 27, G: 27, B: 27, A: 255})
		}
	}
	if _, blank := renderModelBounds(backdrop); !blank {
		t.Fatal("uniform backdrop was not treated as blank")
	}
	for y := 200; y < 400; y++ {
		for x := 250; x < 350; x++ {
			backdrop.Set(x, y, color.RGBA{R: 200, G: 40, B: 40, A: 255})
		}
	}
	if model, blank := renderModelBounds(backdrop); blank || !model.Overlaps(image.Rect(250, 200, 350, 400)) {
		t.Fatal("render with a model was treated as blank")
	}
	frame := squareFrame(image.Rect(250, 200, 350, 400), backdrop.Bounds())
	if frame.Dx() != frame.Dy() || frame.Dx() != 232 || !image.Rect(250, 200, 350, 400).In(frame) {
		t.Fatalf("square frame %v does not hold the model", frame)
	}
	if edge := squareFrame(image.Rect(0, 0, 590, 20), backdrop.Bounds()); edge != backdrop.Bounds() {
		t.Fatalf("wide model frame %v, want whole render", edge)
	}
}

func mustPNG(t *testing.T, picture image.Image) []byte {
	t.Helper()
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, picture); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

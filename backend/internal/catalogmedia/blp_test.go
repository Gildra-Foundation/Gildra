package catalogmedia

import (
	"bytes"
	"encoding/binary"
	"image/png"
	"testing"
)

func TestDecodeBLP2PNGDXT(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name          string
		alphaDepth    byte
		alphaEncoding byte
		mip           []byte
	}{
		{name: "DXT1", mip: []byte{0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0}},
		{name: "DXT5", alphaDepth: 8, alphaEncoding: 7, mip: []byte{
			0xff, 0x00, 0, 0, 0, 0, 0, 0,
			0x00, 0xf8, 0x00, 0x00, 0, 0, 0, 0,
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			data := syntheticBLP2(2, test.alphaDepth, test.alphaEncoding, test.mip)
			encoded, width, height, err := decodeBLP2PNG(data)
			if err != nil {
				t.Fatal(err)
			}
			if width != 4 || height != 4 {
				t.Fatalf("dimensions=%dx%d, want 4x4", width, height)
			}
			decoded, err := png.Decode(bytes.NewReader(encoded))
			if err != nil {
				t.Fatal(err)
			}
			r, g, b, a := decoded.At(0, 0).RGBA()
			if r != 0xffff || g != 0 || b != 0 || a != 0xffff {
				t.Fatalf("first pixel rgba=%04x,%04x,%04x,%04x, want opaque red", r, g, b, a)
			}
		})
	}
}

func TestDecodeBLP2PNGRejectsInvalidBounds(t *testing.T) {
	t.Parallel()
	data := syntheticBLP2(2, 0, 0, []byte{0x00, 0xf8, 0, 0, 0, 0, 0, 0})
	binary.LittleEndian.PutUint32(data[20:24], uint32(len(data)+1))
	if _, _, _, err := decodeBLP2PNG(data); err == nil {
		t.Fatal("decodeBLP2PNG unexpectedly accepted an out-of-bounds mip")
	}
}

func syntheticBLP2(compression, alphaDepth, alphaEncoding byte, mip []byte) []byte {
	data := make([]byte, blp2HeaderSize+len(mip))
	copy(data, "BLP2")
	binary.LittleEndian.PutUint32(data[4:8], 1)
	data[8], data[9], data[10] = compression, alphaDepth, alphaEncoding
	binary.LittleEndian.PutUint32(data[12:16], 4)
	binary.LittleEndian.PutUint32(data[16:20], 4)
	binary.LittleEndian.PutUint32(data[20:24], blp2HeaderSize)
	binary.LittleEndian.PutUint32(data[84:88], uint32(len(mip)))
	copy(data[blp2HeaderSize:], mip)
	return data
}

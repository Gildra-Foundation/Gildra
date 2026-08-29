package catalogmedia

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/png"

	"github.com/zeozeozeo/dxt"
)

const (
	blp2HeaderSize   = 148
	blp2MaxDimension = 4096
)

// decodeBLP2PNG converts the first (largest) mip of a build-pinned Blizzard
// texture into a browser-safe PNG. The decoder is deliberately limited to
// the documented BLP2 encodings used by interface icons.
func decodeBLP2PNG(data []byte) ([]byte, int, int, error) {
	if len(data) < blp2HeaderSize || string(data[:4]) != "BLP2" {
		return nil, 0, 0, errors.New("invalid BLP2 header")
	}
	if version := binary.LittleEndian.Uint32(data[4:8]); version != 1 {
		return nil, 0, 0, fmt.Errorf("unsupported BLP2 version %d", version)
	}
	compression, alphaDepth, alphaEncoding := data[8], data[9], data[10]
	width := binary.LittleEndian.Uint32(data[12:16])
	height := binary.LittleEndian.Uint32(data[16:20])
	if width == 0 || height == 0 || width > blp2MaxDimension || height > blp2MaxDimension {
		return nil, 0, 0, fmt.Errorf("invalid BLP2 dimensions %dx%d", width, height)
	}
	mipOffset := uint64(binary.LittleEndian.Uint32(data[20:24]))
	mipSize := uint64(binary.LittleEndian.Uint32(data[84:88]))
	if mipOffset < blp2HeaderSize || mipSize == 0 || mipOffset+mipSize > uint64(len(data)) {
		return nil, 0, 0, errors.New("invalid BLP2 primary mip bounds")
	}
	mip := data[mipOffset : mipOffset+mipSize]
	pixelCount := uint64(width) * uint64(height)
	if pixelCount > blp2MaxDimension*blp2MaxDimension {
		return nil, 0, 0, errors.New("BLP2 image is too large")
	}

	var pixels []byte
	var err error
	switch compression {
	case 1:
		pixels, err = decodeBLP2Paletted(data, mip, width, height, alphaDepth)
	case 2:
		pixels, err = decodeBLP2DXT(mip, width, height, alphaEncoding)
	case 3:
		pixels, err = decodeBLP2BGRA(mip, width, height)
	default:
		err = fmt.Errorf("unsupported BLP2 compression %d", compression)
	}
	if err != nil {
		return nil, 0, 0, err
	}
	decoded := &image.NRGBA{
		Pix:    pixels,
		Stride: int(width) * 4,
		Rect:   image.Rect(0, 0, int(width), int(height)),
	}
	var output bytes.Buffer
	if err := png.Encode(&output, decoded); err != nil {
		return nil, 0, 0, fmt.Errorf("encode BLP2 PNG: %w", err)
	}
	return output.Bytes(), int(width), int(height), nil
}

func decodeBLP2DXT(mip []byte, width, height uint32, alphaEncoding byte) ([]byte, error) {
	blockSize := uint64(8)
	if alphaEncoding == 1 || alphaEncoding == 7 {
		blockSize = 16
	}
	required := uint64((width+3)/4) * uint64((height+3)/4) * blockSize
	if uint64(len(mip)) < required {
		return nil, errors.New("truncated BLP2 DXT mip")
	}
	input := mip[:required]
	switch alphaEncoding {
	case 0:
		return dxt.DecodeDXT1(input, uint(width), uint(height))
	case 1:
		return dxt.DecodeDXT3(input, uint(width), uint(height))
	case 7:
		return dxt.DecodeDXT5(input, uint(width), uint(height))
	default:
		return nil, fmt.Errorf("unsupported BLP2 DXT alpha encoding %d", alphaEncoding)
	}
}

func decodeBLP2Paletted(data, mip []byte, width, height uint32, alphaDepth byte) ([]byte, error) {
	const paletteBytes = 256 * 4
	if len(data) < blp2HeaderSize+paletteBytes {
		return nil, errors.New("truncated BLP2 palette")
	}
	pixels := int(width * height)
	alphaBytes := 0
	switch alphaDepth {
	case 0:
	case 1:
		alphaBytes = (pixels + 7) / 8
	case 4:
		alphaBytes = (pixels + 1) / 2
	case 8:
		alphaBytes = pixels
	default:
		return nil, fmt.Errorf("unsupported BLP2 palette alpha depth %d", alphaDepth)
	}
	if len(mip) < pixels+alphaBytes {
		return nil, errors.New("truncated BLP2 paletted mip")
	}
	palette := data[blp2HeaderSize : blp2HeaderSize+paletteBytes]
	indices, alpha := mip[:pixels], mip[pixels:pixels+alphaBytes]
	output := make([]byte, pixels*4)
	for index, paletteIndex := range indices {
		color := palette[int(paletteIndex)*4:]
		output[index*4] = color[2]
		output[index*4+1] = color[1]
		output[index*4+2] = color[0]
		output[index*4+3] = blp2Alpha(alpha, index, alphaDepth)
	}
	return output, nil
}

func blp2Alpha(alpha []byte, index int, depth byte) byte {
	switch depth {
	case 1:
		return byte(255 * ((alpha[index/8] >> (index % 8)) & 1))
	case 4:
		return 17 * ((alpha[index/2] >> (4 * (index % 2))) & 0x0f)
	case 8:
		return alpha[index]
	default:
		return 255
	}
}

func decodeBLP2BGRA(mip []byte, width, height uint32) ([]byte, error) {
	required := int(width * height * 4)
	if len(mip) < required {
		return nil, errors.New("truncated BLP2 BGRA mip")
	}
	output := make([]byte, required)
	for index := 0; index < required; index += 4 {
		output[index] = mip[index+2]
		output[index+1] = mip[index+1]
		output[index+2] = mip[index]
		output[index+3] = mip[index+3]
	}
	return output, nil
}

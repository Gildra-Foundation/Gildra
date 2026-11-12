package itemscaling

import (
	"context"
	"errors"

	"github.com/Gildra-Foundation/Gildra/backend/internal/wago"
)

// WagoSource reads the reference tables of an exact build from Wago.
type WagoSource struct{ Client *wago.Client }

func (s WagoSource) Table(ctx context.Context, table, build, locale string, consume func(map[string]string) error) (string, []byte, int64, error) {
	_, proof, err := s.Client.RowsWithProof(ctx, table, build, locale, 0, consume)
	if err != nil {
		return "", nil, 0, err
	}
	if !proof.Complete || len(proof.SHA256) != 32 {
		return "", nil, 0, errors.New("incomplete download")
	}
	return s.Client.CSVURL(table, build, locale), proof.SHA256, proof.ByteSize, nil
}

func (s WagoSource) File(ctx context.Context, fileDataID int, build string) (string, []byte, error) {
	data, err := s.Client.File(ctx, fileDataID, build)
	return s.Client.FileURL(fileDataID, build), data, err
}

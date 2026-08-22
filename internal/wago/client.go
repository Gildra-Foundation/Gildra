package wago

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Description struct {
	ExternalID  int64
	Locale      string
	Name        string
	Description string
}

type Client struct {
	baseURL string
	http    *http.Client
}

func New(baseURL string, httpClient *http.Client) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://wago.tools"
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Minute}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), http: httpClient}
}

func (c *Client) ItemDescriptions(ctx context.Context, build, sourceLocale, targetLocale string, limit int) ([]Description, error) {
	query := url.Values{"build": {build}, "locale": {sourceLocale}}
	endpoint := c.baseURL + "/db2/ItemSparse/csv?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create Wago request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request Wago ItemSparse: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.CopyN(io.Discard, resp.Body, 4096)
		return nil, fmt.Errorf("Wago ItemSparse returned %s", resp.Status)
	}
	reader := csv.NewReader(resp.Body)
	reader.FieldsPerRecord = -1
	headers, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("read Wago headers: %w", err)
	}
	columns := make(map[string]int, len(headers))
	for index, header := range headers {
		columns[header] = index
	}
	for _, required := range []string{"ID", "Display_lang", "Description_lang"} {
		if _, ok := columns[required]; !ok {
			return nil, fmt.Errorf("Wago ItemSparse has no %s column", required)
		}
	}
	result := make([]Description, 0)
	for limit == 0 || len(result) < limit {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read Wago row: %w", err)
		}
		var id int64
		if _, err := fmt.Sscan(cell(row, columns["ID"]), &id); err != nil || id <= 0 {
			continue
		}
		description := strings.TrimSpace(cell(row, columns["Description_lang"]))
		if description == "" {
			continue
		}
		result = append(result, Description{ExternalID: id, Locale: targetLocale, Name: strings.TrimSpace(cell(row, columns["Display_lang"])), Description: description})
	}
	return result, nil
}

func cell(row []string, index int) string {
	if index < 0 || index >= len(row) {
		return ""
	}
	return row[index]
}

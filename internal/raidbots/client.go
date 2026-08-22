package raidbots

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const defaultBaseURL = "https://www.raidbots.com/static/data"

type Metadata struct {
	Environment string    `json:"environment"`
	WoWBuild    string    `json:"wowBuild"`
	ContentHash string    `json:"contentHash"`
	GeneratedAt time.Time `json:"generatedAt"`
	Files       []string  `json:"files"`
}

type Entry struct {
	ID              int64   `json:"id"`
	DefinitionID    int64   `json:"definitionId,omitempty"`
	SpellID         int64   `json:"spellId,omitempty"`
	TraitSubTreeID  int64   `json:"traitSubTreeId,omitempty"`
	TraitTreeID     int64   `json:"traitTreeId,omitempty"`
	Name            string  `json:"name"`
	Icon            string  `json:"icon,omitempty"`
	Type            string  `json:"type,omitempty"`
	MaxRanks        int     `json:"maxRanks,omitempty"`
	Index           int     `json:"index,omitempty"`
	AtlasMemberName string  `json:"atlasMemberName,omitempty"`
	Nodes           []int64 `json:"nodes,omitempty"`
}

type Node struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	MaxRanks  int     `json:"maxRanks,omitempty"`
	SubTreeID int64   `json:"subTreeId,omitempty"`
	Entries   []Entry `json:"entries"`
}

type TalentTree struct {
	TraitTreeID int64  `json:"traitTreeId"`
	ClassName   string `json:"className"`
	ClassID     int64  `json:"classId"`
	SpecName    string `json:"specName"`
	SpecID      int64  `json:"specId"`

	ClassNodes   []Node          `json:"classNodes"`
	SpecNodes    []Node          `json:"specNodes"`
	HeroNodes    []Node          `json:"heroNodes"`
	SubTreeNodes []Node          `json:"subTreeNodes"`
	Raw          json.RawMessage `json:"-"`
}

type Client struct {
	baseURL string
	http    *http.Client
}

func New(baseURL string, httpClient *http.Client) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultBaseURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Minute}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), http: httpClient}
}

func (c *Client) URL(environment, file string) string {
	return c.baseURL + "/" + environment + "/" + file
}

func (c *Client) Metadata(ctx context.Context, environment string) (Metadata, error) {
	var result Metadata
	if err := c.getJSON(ctx, c.URL(environment, "metadata.json"), &result); err != nil {
		return result, fmt.Errorf("read Raidbots metadata: %w", err)
	}
	if result.WoWBuild == "" || result.ContentHash == "" {
		return result, errors.New("Raidbots metadata has no build or content hash")
	}
	return result, nil
}

func (c *Client) TalentTrees(ctx context.Context, environment string) ([]TalentTree, error) {
	endpoint := c.URL(environment, "talents.json")
	var rawTrees []json.RawMessage
	if err := c.getJSON(ctx, endpoint, &rawTrees); err != nil {
		return nil, fmt.Errorf("read Raidbots talents: %w", err)
	}
	trees := make([]TalentTree, 0, len(rawTrees))
	for index, raw := range rawTrees {
		var tree TalentTree
		if err := json.Unmarshal(raw, &tree); err != nil {
			return nil, fmt.Errorf("decode Raidbots talent tree %d: %w", index+1, err)
		}
		tree.Raw = append(json.RawMessage(nil), raw...)
		trees = append(trees, tree)
	}
	return trees, nil
}

func (c *Client) getJSON(ctx context.Context, endpoint string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("request %s: %w", endpoint, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("request %s returned %s", endpoint, resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("decode %s: %w", endpoint, err)
	}
	return nil
}

package main

import (
	"encoding/json"
	"strings"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogimport"
)

type battleNetRewardResource struct {
	Key struct {
		Href string `json:"href"`
	} `json:"key"`
	Name string `json:"name"`
	ID   int64  `json:"id"`
}

type battleNetRewardAmount struct {
	Reward battleNetRewardResource `json:"reward"`
	Value  int64                   `json:"value"`
}

type battleNetItemReward struct {
	Item         battleNetRewardResource `json:"item"`
	Quantity     int64                   `json:"quantity"`
	Requirements json.RawMessage         `json:"requirements"`
}

func parseBattleNetQuestRewards(payload json.RawMessage) ([]catalogimport.QuestReward, error) {
	var document struct {
		Rewards struct {
			Experience int64 `json:"experience"`
			Money      *struct {
				Value int64 `json:"value"`
			} `json:"money"`
			Currency    []battleNetRewardAmount  `json:"currency"`
			Reputations []battleNetRewardAmount  `json:"reputations"`
			Spell       *battleNetRewardResource `json:"spell"`
			Title       *battleNetRewardResource `json:"title"`
			Items       struct {
				Guaranteed []battleNetItemReward `json:"items"`
				ChoiceOf   []battleNetItemReward `json:"choice_of"`
			} `json:"items"`
		} `json:"rewards"`
	}
	if err := json.Unmarshal(payload, &document); err != nil {
		return nil, err
	}
	result := make([]catalogimport.QuestReward, 0, 8)
	indices := make(map[string]int16)
	appendReward := func(rewardType string, resource *battleNetRewardResource, amount int64, choice bool, attributes map[string]any) {
		if amount <= 0 {
			return
		}
		if resource != nil {
			if resource.ID <= 0 {
				return
			}
		}
		reward := catalogimport.QuestReward{Type: rewardType, Index: indices[rewardType], Amount: amount, Choice: choice, Attributes: attributes}
		indices[rewardType]++
		if resource != nil {
			reward.ExternalID = &resource.ID
			reward.Name = strings.TrimSpace(resource.Name)
			if reward.Attributes == nil {
				reward.Attributes = make(map[string]any)
			}
			if href := strings.TrimSpace(resource.Key.Href); href != "" {
				reward.Attributes["source_url"] = href
			}
		}
		result = append(result, reward)
	}
	appendReward("experience", nil, document.Rewards.Experience, false, nil)
	if document.Rewards.Money != nil {
		appendReward("money", nil, document.Rewards.Money.Value, false, nil)
	}
	for index := range document.Rewards.Currency {
		entry := &document.Rewards.Currency[index]
		appendReward("currency", &entry.Reward, entry.Value, false, nil)
	}
	for index := range document.Rewards.Reputations {
		entry := &document.Rewards.Reputations[index]
		appendReward("reputation", &entry.Reward, entry.Value, false, nil)
	}
	if document.Rewards.Spell != nil {
		appendReward("spell", document.Rewards.Spell, 1, false, nil)
	}
	if document.Rewards.Title != nil {
		appendReward("title", document.Rewards.Title, 1, false, nil)
	}
	appendItem := func(entry battleNetItemReward, choice bool) {
		amount := entry.Quantity
		if amount <= 0 {
			amount = 1
		}
		attributes := make(map[string]any)
		if len(entry.Requirements) > 0 && string(entry.Requirements) != "null" && string(entry.Requirements) != "{}" {
			attributes["requirements"] = entry.Requirements
		}
		appendReward("item", &entry.Item, amount, choice, attributes)
	}
	for _, entry := range document.Rewards.Items.Guaranteed {
		appendItem(entry, false)
	}
	for _, entry := range document.Rewards.Items.ChoiceOf {
		appendItem(entry, true)
	}
	return result, nil
}

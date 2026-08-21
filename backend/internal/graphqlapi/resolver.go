package graphqlapi

import (
	"strconv"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalog"
	"github.com/Gildra-Foundation/Gildra/backend/internal/graphqlapi/model"
)

//go:generate go tool gqlgen generate

type Resolver struct {
	Catalog *catalog.Service
}

func localeValue(locale *model.Locale) string {
	if locale != nil && *locale == model.LocaleRuRu {
		return "ru_RU"
	}
	return "en_US"
}

func toGraphQLEntity(entity catalog.Entity) *model.GameEntity {
	result := &model.GameEntity{
		ID: entity.ID.String(), Product: entity.Product, Type: entity.Type,
		ExternalID: strconv.FormatInt(entity.ExternalID, 10), Slug: entity.Slug,
		Locale: model.Locale(entity.Locale), Name: entity.Name, Description: entity.Description,
		Payload: entity.Payload, UpdatedAt: entity.UpdatedAt,
	}
	if entity.BuildID != nil {
		buildID := strconv.FormatInt(*entity.BuildID, 10)
		result.BuildID = &buildID
	}
	return result
}

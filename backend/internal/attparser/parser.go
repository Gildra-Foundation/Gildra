package attparser

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"

	"github.com/yuin/gopher-lua/ast"
	"github.com/yuin/gopher-lua/parse"
)

type Identity struct {
	RecordKey string `json:"record_key"`
	Kind      string `json:"kind"`
	SourceID  int64  `json:"source_id"`
}

type Reference struct {
	Kind             string            `json:"kind"`
	TargetType       string            `json:"target_type"`
	TargetExternalID int64             `json:"target_external_id"`
	Ordinal          int               `json:"ordinal"`
	Attributes       map[string]any    `json:"attributes"`
	ContentHash      [sha256.Size]byte `json:"-"`
}

type Node struct {
	RecordKey       string            `json:"record_key"`
	ParentRecordKey string            `json:"parent_record_key,omitempty"`
	Kind            string            `json:"kind"`
	SourceID        int64             `json:"source_id"`
	ExternalID      *int64            `json:"external_id,omitempty"`
	SourceLine      int               `json:"source_line"`
	AncestorPath    []Identity        `json:"ancestor_path"`
	Fields          map[string]any    `json:"fields"`
	RawSource       string            `json:"raw_source"`
	References      []Reference       `json:"references"`
	ContentHash     [sha256.Size]byte `json:"-"`
}

type constructorSpec struct {
	Kind  string
	IDArg int
}

type extractor struct {
	fileName     string
	lines        []string
	aliases      map[string]constructorSpec
	lineOrdinals map[int]int
	nodes        []Node
}

// Parse reads ATT-generated Lua as syntax only. It never creates a Lua state,
// evaluates an expression, invokes a callback, or executes repository code.
func Parse(source []byte, fileName string) ([]Node, error) {
	fileName = filepath.ToSlash(strings.TrimSpace(fileName))
	if len(source) == 0 || fileName == "" {
		return nil, errors.New("ATT source and file name are required")
	}
	source = bytes.TrimPrefix(source, []byte{0xef, 0xbb, 0xbf})
	chunk, err := parse.Parse(bytes.NewReader(source), fileName)
	if err != nil {
		return nil, fmt.Errorf("parse ATT Lua %s: %w", fileName, err)
	}
	ex := &extractor{
		fileName:     fileName,
		lines:        strings.Split(strings.ReplaceAll(string(source), "\r\n", "\n"), "\n"),
		aliases:      defaultAliases(),
		lineOrdinals: make(map[int]int),
	}
	ex.collectAliases(chunk)
	ex.walkStatements(chunk, nil)
	return ex.nodes, nil
}

func defaultAliases() map[string]constructorSpec {
	return map[string]constructorSpec{
		"i": {Kind: "item"}, "s": {Kind: "item", IDArg: 1},
		"n": {Kind: "creature"}, "q": {Kind: "quest"},
		"r": {Kind: "recipe"}, "m": {Kind: "map"},
	}
}

func (ex *extractor) collectAliases(statements []ast.Stmt) {
	for _, statement := range statements {
		switch typed := statement.(type) {
		case *ast.LocalAssignStmt:
			for index, name := range typed.Names {
				if index >= len(typed.Exprs) {
					break
				}
				if spec, ok := createConstructorSpec(typed.Exprs[index]); ok {
					ex.aliases[name] = spec
				}
			}
			ex.collectAliasesFromExprs(typed.Exprs)
		case *ast.AssignStmt:
			ex.collectAliasesFromExprs(typed.Rhs)
		case *ast.FuncCallStmt:
			ex.collectAliasesFromExpr(typed.Expr)
		case *ast.DoBlockStmt:
			ex.collectAliases(typed.Stmts)
		case *ast.WhileStmt:
			ex.collectAliases(typed.Stmts)
		case *ast.RepeatStmt:
			ex.collectAliases(typed.Stmts)
		case *ast.IfStmt:
			ex.collectAliases(typed.Then)
			ex.collectAliases(typed.Else)
		case *ast.NumberForStmt:
			ex.collectAliases(typed.Stmts)
		case *ast.GenericForStmt:
			ex.collectAliases(typed.Stmts)
		case *ast.FuncDefStmt:
			ex.collectAliases(typed.Func.Stmts)
		}
	}
}

func (ex *extractor) collectAliasesFromExprs(expressions []ast.Expr) {
	for _, expression := range expressions {
		ex.collectAliasesFromExpr(expression)
	}
}

func (ex *extractor) collectAliasesFromExpr(expression ast.Expr) {
	switch typed := expression.(type) {
	case *ast.FunctionExpr:
		ex.collectAliases(typed.Stmts)
	case *ast.FuncCallExpr:
		for _, argument := range typed.Args {
			ex.collectAliasesFromExpr(argument)
		}
	case *ast.TableExpr:
		for _, field := range typed.Fields {
			ex.collectAliasesFromExpr(field.Value)
		}
	}
}

func createConstructorSpec(expression ast.Expr) (constructorSpec, bool) {
	name := attributeName(expression)
	if !strings.HasPrefix(name, "Create") {
		return constructorSpec{}, false
	}
	kind := constructorKind(name)
	if kind == "" {
		return constructorSpec{}, false
	}
	spec := constructorSpec{Kind: kind}
	if name == "CreateItemSource" {
		spec.IDArg = 1
	}
	return spec, true
}

func constructorKind(name string) string {
	known := map[string]string{
		"CreateAchievement": "achievement", "CreateAchievementCriteria": "achievement_criteria",
		"CreateCurrencyClass": "currency", "CreateCustomHeader": "custom_header",
		"CreateEncounter": "encounter", "CreateItem": "item", "CreateItemSource": "item",
		"CreateMap": "map", "CreateMount": "mount", "CreateNPC": "creature",
		"CreateObject": "game_object", "CreateQuest": "quest", "CreateRecipe": "recipe",
		"CreateSpecies": "battle_pet", "CreateSpell": "spell", "CreateToy": "toy",
	}
	if kind := known[name]; kind != "" {
		return kind
	}
	return snakeCase(strings.TrimPrefix(name, "Create"))
}

func snakeCase(value string) string {
	var result strings.Builder
	for index, char := range value {
		if !unicode.IsLetter(char) && !unicode.IsDigit(char) {
			if result.Len() > 0 && !strings.HasSuffix(result.String(), "_") {
				result.WriteByte('_')
			}
			continue
		}
		if unicode.IsUpper(char) && index > 0 {
			previous := rune(value[index-1])
			if unicode.IsLower(previous) || unicode.IsDigit(previous) {
				result.WriteByte('_')
			}
		}
		result.WriteRune(unicode.ToLower(char))
	}
	return strings.Trim(result.String(), "_")
}

func attributeName(expression ast.Expr) string {
	attribute, ok := expression.(*ast.AttrGetExpr)
	if !ok {
		return ""
	}
	key, ok := attribute.Key.(*ast.StringExpr)
	if !ok {
		return ""
	}
	return key.Value
}

func (ex *extractor) walkStatements(statements []ast.Stmt, ancestors []Identity) {
	for _, statement := range statements {
		switch typed := statement.(type) {
		case *ast.AssignStmt:
			ex.walkExpressions(typed.Lhs, ancestors)
			ex.walkExpressions(typed.Rhs, ancestors)
		case *ast.LocalAssignStmt:
			ex.walkExpressions(typed.Exprs, ancestors)
		case *ast.FuncCallStmt:
			ex.walkExpr(typed.Expr, ancestors)
		case *ast.DoBlockStmt:
			ex.walkStatements(typed.Stmts, ancestors)
		case *ast.WhileStmt:
			ex.walkExpr(typed.Condition, ancestors)
			ex.walkStatements(typed.Stmts, ancestors)
		case *ast.RepeatStmt:
			ex.walkStatements(typed.Stmts, ancestors)
			ex.walkExpr(typed.Condition, ancestors)
		case *ast.IfStmt:
			ex.walkExpr(typed.Condition, ancestors)
			ex.walkStatements(typed.Then, ancestors)
			ex.walkStatements(typed.Else, ancestors)
		case *ast.NumberForStmt:
			ex.walkExpr(typed.Init, ancestors)
			ex.walkExpr(typed.Limit, ancestors)
			ex.walkExpr(typed.Step, ancestors)
			ex.walkStatements(typed.Stmts, ancestors)
		case *ast.GenericForStmt:
			ex.walkExpressions(typed.Exprs, ancestors)
			ex.walkStatements(typed.Stmts, ancestors)
		case *ast.FuncDefStmt:
			ex.walkExpr(typed.Func, ancestors)
		case *ast.ReturnStmt:
			ex.walkExpressions(typed.Exprs, ancestors)
		}
	}
}

func (ex *extractor) walkExpressions(expressions []ast.Expr, ancestors []Identity) {
	for _, expression := range expressions {
		ex.walkExpr(expression, ancestors)
	}
}

func (ex *extractor) walkExpr(expression ast.Expr, ancestors []Identity) {
	if expression == nil {
		return
	}
	switch typed := expression.(type) {
	case *ast.FuncCallExpr:
		if spec, ok := ex.callSpec(typed.Func); ok {
			ex.walkConstructor(typed, spec, ancestors)
			return
		}
		ex.walkExpr(typed.Func, ancestors)
		ex.walkExpr(typed.Receiver, ancestors)
		ex.walkExpressions(typed.Args, ancestors)
	case *ast.FunctionExpr:
		ex.walkStatements(typed.Stmts, ancestors)
	case *ast.TableExpr:
		for _, field := range typed.Fields {
			ex.walkExpr(field.Key, ancestors)
			ex.walkExpr(field.Value, ancestors)
		}
	case *ast.AttrGetExpr:
		ex.walkExpr(typed.Object, ancestors)
		ex.walkExpr(typed.Key, ancestors)
	case *ast.LogicalOpExpr:
		ex.walkExpr(typed.Lhs, ancestors)
		ex.walkExpr(typed.Rhs, ancestors)
	case *ast.RelationalOpExpr:
		ex.walkExpr(typed.Lhs, ancestors)
		ex.walkExpr(typed.Rhs, ancestors)
	case *ast.StringConcatOpExpr:
		ex.walkExpr(typed.Lhs, ancestors)
		ex.walkExpr(typed.Rhs, ancestors)
	case *ast.ArithmeticOpExpr:
		ex.walkExpr(typed.Lhs, ancestors)
		ex.walkExpr(typed.Rhs, ancestors)
	case *ast.UnaryMinusOpExpr:
		ex.walkExpr(typed.Expr, ancestors)
	case *ast.UnaryNotOpExpr:
		ex.walkExpr(typed.Expr, ancestors)
	case *ast.UnaryLenOpExpr:
		ex.walkExpr(typed.Expr, ancestors)
	}
}

func (ex *extractor) callSpec(function ast.Expr) (constructorSpec, bool) {
	if identifier, ok := function.(*ast.IdentExpr); ok {
		spec, exists := ex.aliases[identifier.Value]
		return spec, exists
	}
	return createConstructorSpec(function)
}

func (ex *extractor) walkConstructor(call *ast.FuncCallExpr, spec constructorSpec, ancestors []Identity) {
	sourceID, ok := callIntegerArgument(call.Args, spec.IDArg)
	if !ok {
		ex.walkExpressions(call.Args, ancestors)
		return
	}
	line := call.Line()
	ex.lineOrdinals[line]++
	recordKey := fmt.Sprintf("%s:%d:%d", ex.fileName, line, ex.lineOrdinals[line])
	node := Node{
		RecordKey: recordKey, Kind: spec.Kind, SourceID: sourceID, SourceLine: line,
		AncestorPath: append([]Identity(nil), ancestors...), Fields: map[string]any{},
		RawSource: ex.sourceLine(line),
	}
	if sourceID > 0 {
		node.ExternalID = &sourceID
	}
	if len(ancestors) > 0 {
		node.ParentRecordKey = ancestors[len(ancestors)-1].RecordKey
	}
	var data *ast.TableExpr
	for _, argument := range call.Args {
		if table, ok := argument.(*ast.TableExpr); ok {
			data = table
		}
	}
	if data != nil {
		node.Fields = namedFields(data)
		node.References = extractReferences(data)
	}
	node.ContentHash = hashValue(struct {
		RecordKey string
		Kind      string
		SourceID  int64
		Ancestors []Identity
		Fields    map[string]any
		RawSource string
	}{node.RecordKey, node.Kind, node.SourceID, node.AncestorPath, node.Fields, node.RawSource})
	for index := range node.References {
		node.References[index].Ordinal = index
		node.References[index].ContentHash = hashValue(node.References[index])
	}
	ex.nodes = append(ex.nodes, node)
	nextAncestors := append(append([]Identity(nil), ancestors...), Identity{
		RecordKey: recordKey, Kind: spec.Kind, SourceID: sourceID,
	})
	for _, argument := range call.Args {
		if argument != data {
			ex.walkExpr(argument, ancestors)
			continue
		}
		for _, field := range data.Fields {
			ex.walkExpr(field.Value, nextAncestors)
		}
	}
}

func (ex *extractor) sourceLine(line int) string {
	if line < 1 || line > len(ex.lines) {
		return "source line unavailable"
	}
	value := strings.TrimSpace(ex.lines[line-1])
	if value == "" {
		return "source line unavailable"
	}
	return value
}

func callIntegerArgument(arguments []ast.Expr, index int) (int64, bool) {
	if index < 0 || index >= len(arguments) {
		return 0, false
	}
	return integerValue(arguments[index])
}

func integerValue(expression ast.Expr) (int64, bool) {
	switch typed := expression.(type) {
	case *ast.NumberExpr:
		value, err := strconv.ParseInt(typed.Value, 0, 64)
		return value, err == nil
	case *ast.UnaryMinusOpExpr:
		value, ok := integerValue(typed.Expr)
		return -value, ok
	default:
		return 0, false
	}
}

func namedFields(table *ast.TableExpr) map[string]any {
	result := make(map[string]any)
	for _, field := range table.Fields {
		key, ok := field.Key.(*ast.StringExpr)
		if !ok || key.Value == "g" {
			continue
		}
		if value, ok := literalValue(field.Value, 0); ok {
			result[key.Value] = value
		}
	}
	return result
}

func literalValue(expression ast.Expr, depth int) (any, bool) {
	if expression == nil || depth > 12 {
		return nil, false
	}
	switch typed := expression.(type) {
	case *ast.StringExpr:
		return typed.Value, true
	case *ast.NumberExpr:
		if integer, err := strconv.ParseInt(typed.Value, 0, 64); err == nil {
			return integer, true
		}
		value, err := strconv.ParseFloat(typed.Value, 64)
		return value, err == nil
	case *ast.UnaryMinusOpExpr:
		value, ok := literalValue(typed.Expr, depth+1)
		if !ok {
			return nil, false
		}
		switch number := value.(type) {
		case int64:
			return -number, true
		case float64:
			return -number, true
		}
		return nil, false
	case *ast.TrueExpr:
		return true, true
	case *ast.FalseExpr:
		return false, true
	case *ast.NilExpr:
		return nil, true
	case *ast.TableExpr:
		array := make([]any, 0, len(typed.Fields))
		object := make(map[string]any)
		hasNamed := false
		for index, field := range typed.Fields {
			value, ok := literalValue(field.Value, depth+1)
			if !ok {
				continue
			}
			if field.Key == nil {
				array = append(array, value)
				continue
			}
			hasNamed = true
			key, ok := literalValue(field.Key, depth+1)
			if ok {
				object[fmt.Sprint(key)] = value
			} else {
				object[strconv.Itoa(index+1)] = value
			}
		}
		if !hasNamed {
			return array, true
		}
		if len(array) > 0 {
			object["_values"] = array
		}
		return object, true
	default:
		return nil, false
	}
}

func extractReferences(table *ast.TableExpr) []Reference {
	result := make([]Reference, 0)
	for _, field := range table.Fields {
		key, ok := field.Key.(*ast.StringExpr)
		if !ok {
			continue
		}
		switch key.Value {
		case "providers":
			result = appendTupleReferences(result, "provider", field.Value)
		case "cost":
			result = appendTupleReferences(result, "cost", field.Value)
		case "coords":
			result = appendCoordinateReferences(result, field.Value)
		case "maps":
			result = appendNumberReferences(result, "map", "map", field.Value)
		case "qgs":
			result = appendNumberReferences(result, "quest_giver", "creature", field.Value)
		case "crs":
			result = appendNumberReferences(result, "creature", "creature", field.Value)
		case "sourceQuests":
			result = appendNumberReferences(result, "quest_requirement", "quest", field.Value)
		case "sourceAchievements":
			result = appendNumberReferences(result, "achievement_requirement", "achievement", field.Value)
		default:
			if targetType := directReferenceType(key.Value); targetType != "" {
				if id, ok := integerValue(field.Value); ok && id > 0 {
					result = append(result, Reference{Kind: "field", TargetType: targetType, TargetExternalID: id, Attributes: map[string]any{"field": key.Value}})
				}
			}
		}
	}
	return result
}

func directReferenceType(field string) string {
	return map[string]string{
		"itemID": "item", "npcID": "creature", "questID": "quest",
		"spellID": "spell", "achID": "achievement", "currencyID": "currency",
		"factionID": "faction", "mapID": "map", "recipeID": "recipe",
	}[field]
}

func appendTupleReferences(result []Reference, kind string, expression ast.Expr) []Reference {
	table, ok := expression.(*ast.TableExpr)
	if !ok {
		return result
	}
	for _, field := range table.Fields {
		tuple, ok := field.Value.(*ast.TableExpr)
		if !ok || len(tuple.Fields) < 2 {
			continue
		}
		token, tokenOK := literalValue(tuple.Fields[0].Value, 0)
		id, idOK := integerValue(tuple.Fields[1].Value)
		targetType := referenceTokenType(fmt.Sprint(token))
		if !tokenOK || !idOK || id <= 0 || targetType == "" {
			continue
		}
		attributes := map[string]any{}
		if len(tuple.Fields) > 2 {
			if amount, ok := literalValue(tuple.Fields[2].Value, 0); ok {
				attributes["amount"] = amount
			}
		}
		result = append(result, Reference{Kind: kind, TargetType: targetType, TargetExternalID: id, Attributes: attributes})
	}
	return result
}

func referenceTokenType(token string) string {
	return map[string]string{
		"i": "item", "n": "creature", "o": "game_object", "q": "quest",
		"c": "currency", "r": "recipe", "a": "achievement", "m": "map",
		"f": "faction", "s": "spell",
	}[token]
}

func appendNumberReferences(result []Reference, kind, targetType string, expression ast.Expr) []Reference {
	table, ok := expression.(*ast.TableExpr)
	if !ok {
		return result
	}
	for _, field := range table.Fields {
		if id, ok := integerValue(field.Value); ok && id > 0 {
			result = append(result, Reference{Kind: kind, TargetType: targetType, TargetExternalID: id, Attributes: map[string]any{}})
		}
	}
	return result
}

func appendCoordinateReferences(result []Reference, expression ast.Expr) []Reference {
	table, ok := expression.(*ast.TableExpr)
	if !ok {
		return result
	}
	for _, field := range table.Fields {
		coordinate, ok := field.Value.(*ast.TableExpr)
		if !ok || len(coordinate.Fields) < 3 {
			continue
		}
		x, xOK := literalValue(coordinate.Fields[0].Value, 0)
		y, yOK := literalValue(coordinate.Fields[1].Value, 0)
		mapID, mapOK := integerValue(coordinate.Fields[2].Value)
		if !xOK || !yOK || !mapOK || mapID <= 0 {
			continue
		}
		result = append(result, Reference{Kind: "coordinate", TargetType: "map", TargetExternalID: mapID, Attributes: map[string]any{"x": x, "y": y}})
	}
	return result
}

func hashValue(value any) [sha256.Size]byte {
	encoded, _ := json.Marshal(value)
	return sha256.Sum256(encoded)
}

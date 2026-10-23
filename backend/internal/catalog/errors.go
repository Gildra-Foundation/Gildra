package catalog

import "errors"

// ErrInvalidRequest marks errors caused by invalid caller input. Their message
// is safe to return to API clients; every other error is internal.
var ErrInvalidRequest = errors.New("invalid catalog request")

type invalidRequestError struct{ message string }

func (e *invalidRequestError) Error() string { return e.message }

func (e *invalidRequestError) Is(target error) bool { return target == ErrInvalidRequest }

// invalidRequest returns a client-facing validation error with message.
func invalidRequest(message string) error { return &invalidRequestError{message: message} }

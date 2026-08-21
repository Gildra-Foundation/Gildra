package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Gildra-Foundation/Gildra/backend/internal/auth"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("administrator password rotated and active sessions revoked")
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	email := os.Getenv("ADMIN_EMAIL")
	password := os.Getenv("ADMIN_PASSWORD")
	if databaseURL == "" || email == "" || password == "" {
		return errors.New("DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD are required")
	}
	ctx := context.Background()
	postgres, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer postgres.Close()
	return auth.NewService(postgres, 0).SetPassword(ctx, email, password)
}

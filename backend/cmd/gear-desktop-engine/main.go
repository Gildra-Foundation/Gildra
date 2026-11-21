// The desktop process owns this loopback worker. A private per-launch secret
// and inherited stdin bind its access and lifetime to that one process.
package main

import (
	"crypto/subtle"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/Gildra-Foundation/Gildra/backend/internal/rotationlab"
)

func main() {
	secret := os.Getenv("GEAR_ENGINE_KEY")
	if len(secret) != 64 {
		log.Fatal("missing desktop session")
	}
	os.Unsetenv("GEAR_ENGINE_KEY")
	engine, err := rotationlab.NewSimCEngine(os.Getenv("SIMC_BINARY"), os.Getenv("SIMC_FURY_PROFILE"), 750)
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	rotationlab.NewWorkerHandler(engine).Register(mux)
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 200 * time.Second,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+secret)) != 1 {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			mux.ServeHTTP(w, r)
		}),
	}
	go func() { _, _ = io.Copy(io.Discard, os.Stdin); _ = server.Close() }()
	fmt.Println(listener.Addr().(*net.TCPAddr).Port)
	if err = server.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

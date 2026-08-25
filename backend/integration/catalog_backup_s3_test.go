//go:build integration

package integration

import (
	"bytes"
	"context"
	"io"
	"testing"

	"github.com/Gildra-Foundation/Gildra/backend/internal/catalogbackup"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestCatalogBackupS3StoreTransfersMultipartObject(t *testing.T) {
	ctx := context.Background()
	const accessKey = "gildra-integration-access"
	const secretKey = "gildra-integration-secret-key"
	container, err := testcontainers.Run(ctx, "minio/minio:RELEASE.2025-07-23T15-54-02Z",
		testcontainers.WithExposedPorts("9000/tcp"),
		testcontainers.WithEnv(map[string]string{"MINIO_ROOT_USER": accessKey, "MINIO_ROOT_PASSWORD": secretKey}),
		testcontainers.WithCmd("server", "/data"),
		testcontainers.WithWaitStrategy(wait.ForHTTP("/minio/health/ready").WithPort("9000/tcp")),
	)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	host, err := container.Host(ctx)
	if err != nil {
		t.Fatal(err)
	}
	port, err := container.MappedPort(ctx, "9000/tcp")
	if err != nil {
		t.Fatal(err)
	}
	endpoint := "http://" + host + ":" + port.Port()
	configuration, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion("us-east-1"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		t.Fatal(err)
	}
	client := s3.NewFromConfig(configuration, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(endpoint)
		options.UsePathStyle = true
	})
	const bucket = "gildra-backup-integration"
	if _, err := client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(bucket)}); err != nil {
		t.Fatal(err)
	}
	store, err := catalogbackup.NewS3Store(ctx, catalogbackup.S3Config{
		Endpoint: endpoint, Region: "us-east-1", Bucket: bucket,
		AccessKeyID: accessKey, SecretAccessKey: secretKey,
		URIScheme: "s3", UsePathStyle: true, AllowHTTP: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	payload := bytes.Repeat([]byte("gildra-backup-proof-"), 700_000)
	const key = "catalog/wow/multipart-proof.dump.age"
	if err := store.Put(ctx, key, bytes.NewReader(payload), int64(len(payload)), "application/octet-stream", map[string]string{"proof": "true"}); err != nil {
		t.Fatal(err)
	}
	object, err := store.Get(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	defer object.Body.Close()
	got, err := io.ReadAll(object.Body)
	if err != nil {
		t.Fatal(err)
	}
	if object.Size != int64(len(payload)) || !bytes.Equal(got, payload) {
		t.Fatalf("downloaded object size = %d/%d, bytes equal = %t", object.Size, len(payload), bytes.Equal(got, payload))
	}
}

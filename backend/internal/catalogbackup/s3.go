package catalogbackup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/transfermanager"
	transfertypes "github.com/aws/aws-sdk-go-v2/feature/s3/transfermanager/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type S3Config struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	URIScheme       string
	UsePathStyle    bool
	AllowHTTP       bool
}

func (c S3Config) Validate() error {
	endpoint, err := url.Parse(c.Endpoint)
	if err != nil || endpoint.Host == "" || endpoint.Path != "" && endpoint.Path != "/" {
		return errors.New("S3 endpoint must be an absolute origin URL")
	}
	if endpoint.Scheme != "https" && !(c.AllowHTTP && endpoint.Scheme == "http") {
		return errors.New("S3 endpoint must use HTTPS")
	}
	if strings.TrimSpace(c.Region) == "" || strings.TrimSpace(c.Bucket) == "" {
		return errors.New("S3 region and bucket are required")
	}
	if strings.TrimSpace(c.AccessKeyID) == "" || strings.TrimSpace(c.SecretAccessKey) == "" {
		return errors.New("S3 access key ID and secret access key are required")
	}
	if c.URIScheme != "s3" && c.URIScheme != "r2" {
		return errors.New("backup URI scheme must be s3 or r2")
	}
	return nil
}

type S3Store struct {
	bucket   string
	scheme   string
	client   *s3.Client
	transfer *transfermanager.Client
}

func NewS3Store(ctx context.Context, config S3Config) (*S3Store, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}
	awsConfiguration, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(config.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(config.AccessKeyID, config.SecretAccessKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("load S3 configuration: %w", err)
	}
	client := s3.NewFromConfig(awsConfiguration, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(config.Endpoint)
		options.UsePathStyle = config.UsePathStyle
	})
	return &S3Store{
		bucket: config.Bucket, scheme: config.URIScheme, client: client,
		transfer: transfermanager.New(client),
	}, nil
}

func (s *S3Store) URI(key string) string {
	return s.scheme + "://" + s.bucket + "/" + strings.TrimLeft(key, "/")
}

func (s *S3Store) Put(ctx context.Context, key string, source io.Reader, size int64, contentType string, metadata map[string]string) error {
	if err := validateObjectKey(key); err != nil {
		return err
	}
	if size < 0 {
		return errors.New("object size cannot be negative")
	}
	_, err := s.transfer.UploadObject(ctx, &transfermanager.UploadObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(key), Body: source,
		ContentLength: aws.Int64(size), MpuObjectSize: aws.Int64(size),
		ContentType: aws.String(contentType), Metadata: metadata,
		ChecksumAlgorithm: transfertypes.ChecksumAlgorithm("SHA256"),
	})
	if err != nil {
		return fmt.Errorf("put S3 object %s: %w", path.Base(key), err)
	}
	return nil
}

func (s *S3Store) Get(ctx context.Context, key string) (StoredObject, error) {
	if err := validateObjectKey(key); err != nil {
		return StoredObject{}, err
	}
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket), Key: aws.String(key),
		ChecksumMode: types.ChecksumModeEnabled,
	})
	if err != nil {
		return StoredObject{}, fmt.Errorf("get S3 object %s: %w", path.Base(key), err)
	}
	return StoredObject{Body: output.Body, Size: aws.ToInt64(output.ContentLength)}, nil
}

func validateObjectKey(key string) error {
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "..") || strings.Contains(key, "\\") || path.Clean(key) != key {
		return errors.New("S3 object key must be a relative clean path")
	}
	return nil
}

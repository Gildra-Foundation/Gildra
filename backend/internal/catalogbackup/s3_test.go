package catalogbackup

import "testing"

func TestS3ConfigRequiresEncryptedOffHostStorage(t *testing.T) {
	base := S3Config{
		Endpoint: "https://s3.eu-west.example", Region: "eu-west", Bucket: "gildra-backups",
		AccessKeyID: "access", SecretAccessKey: "secret", URIScheme: "s3",
	}
	if err := base.Validate(); err != nil {
		t.Fatal(err)
	}
	base.Endpoint = "http://s3.eu-west.example"
	if err := base.Validate(); err == nil {
		t.Fatal("unencrypted S3 endpoint was accepted")
	}
	base.Endpoint = "https://s3.eu-west.example"
	base.URIScheme = "file"
	if err := base.Validate(); err == nil {
		t.Fatal("local backup URI scheme was accepted")
	}
}

func TestS3ObjectKeyRejectsTraversal(t *testing.T) {
	for _, key := range []string{"", "/absolute.dump", "catalog/../secret", `catalog\\secret`} {
		if err := validateObjectKey(key); err == nil {
			t.Fatalf("unsafe object key %q was accepted", key)
		}
	}
	if err := validateObjectKey("catalog/wow/2026/08/25/archive.dump.age"); err != nil {
		t.Fatal(err)
	}
}

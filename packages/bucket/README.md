# @celerity-sdk/bucket

Object storage abstraction for the Celerity Node SDK.

Provides a unified `BucketClient` interface for working with object storage across cloud providers:

- **AWS**: Amazon S3
- **Google Cloud**: Google Cloud Storage
- **Azure**: Azure Blob Storage

## Installation

```bash
pnpm add @celerity-sdk/bucket
```

Install the cloud SDK for your target platform as a peer dependency:

```bash
# AWS
pnpm add @aws-sdk/client-s3

# GCP
pnpm add @google-cloud/storage

# Azure
pnpm add @azure/storage-blob
```

## Status

This package implements the `BucketClient` interface and provides an `S3Provider` for AWS S3. Support for Google Cloud Storage and Azure Blob Storage will be added in future releases.

## Part of the Celerity Framework

See [celerityframework.io](https://celerityframework.io) for full documentation.

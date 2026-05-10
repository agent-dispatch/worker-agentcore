#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-${AGENTDISPATCH_AWS_REGION:-us-west-2}}"
ECR_REPOSITORY="${ECR_REPOSITORY:-agentdispatch-worker-agentcore}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORM="${PLATFORM:-linux/arm64}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required." >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${IMAGE_TAG}"

aws ecr describe-repositories \
  --region "$AWS_REGION" \
  --repository-names "$ECR_REPOSITORY" >/dev/null 2>&1 || \
  aws ecr create-repository \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" >/dev/null

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

npm ci
npm run build

docker buildx build \
  --platform "$PLATFORM" \
  --tag "$IMAGE_URI" \
  --push \
  .

echo "$IMAGE_URI"

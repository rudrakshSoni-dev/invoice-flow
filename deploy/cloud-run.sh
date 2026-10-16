#!/usr/bin/env bash
# Deploys InvoiceFlow to Cloud Run: the API (with the job worker) and the nginx web app.
# Safe to re-run; every step creates what is missing and updates what exists.
#
#   PROJECT_ID=my-project DATABASE_URL='postgresql://...' LLM_API_KEY=... deploy/cloud-run.sh
#
# DATABASE_URL: a managed Postgres (Neon or Cloud SQL). Use a direct, non-pooled connection
# string, because Prisma runs migrations through it when the API starts.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
LLM_PROVIDER="${LLM_PROVIDER:-gemini}"
LLM_MODEL="${LLM_MODEL:-}"
# One warm instance keeps the first visit fast and the worker running between requests.
MIN_INSTANCES="${MIN_INSTANCES:-1}"
REPO="invoiceflow"
BUCKET="${BUCKET:-${PROJECT_ID}-invoiceflow-uploads}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
TAG="$(git rev-parse --short HEAD)"

gcloud() { command gcloud --project "$PROJECT_ID" --quiet "$@"; }
step() { printf '\n==> %s\n' "$*"; }

step "Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com storage.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

step "Artifact Registry repository ${REPO}"
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --location "$REGION" --repository-format docker

step "Bucket gs://${BUCKET} for invoice files"
gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1 ||
  gcloud storage buckets create "gs://${BUCKET}" --location "$REGION" --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member "serviceAccount:${RUNTIME_SA}" --role roles/storage.objectAdmin >/dev/null

step "Secrets"
put_secret() { # name, value from env var named in $2
  local name="$1" value="${!2:-}"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    [[ -n "$value" ]] || { echo "Set $2 for the first deploy" >&2; exit 1; }
    gcloud secrets create "$name" --replication-policy automatic >/dev/null
  fi
  if [[ -n "$value" ]]; then printf '%s' "$value" | gcloud secrets versions add "$name" --data-file -; fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member "serviceAccount:${RUNTIME_SA}" --role roles/secretmanager.secretAccessor >/dev/null
}
put_secret invoiceflow-database-url DATABASE_URL
put_secret invoiceflow-llm-api-key LLM_API_KEY

step "Building images (${TAG})"
for app in api web; do
  gcloud builds submit --config deploy/cloudbuild.yaml \
    --substitutions "_DOCKERFILE=apps/${app}/Dockerfile,_IMAGE=${REGISTRY}/${app}:${TAG}" .
done

step "Deploying invoiceflow-api"
# max-instances 1: live updates use an in-process event bus (DESIGN.md section 8).
# no-cpu-throttling: the job worker keeps processing after the upload request returns.
gcloud run deploy invoiceflow-api --region "$REGION" --image "${REGISTRY}/api:${TAG}" \
  --allow-unauthenticated --min-instances "$MIN_INSTANCES" --max-instances 1 \
  --no-cpu-throttling --memory 1Gi --timeout 3600 \
  --set-secrets "DATABASE_URL=invoiceflow-database-url:latest,LLM_API_KEY=invoiceflow-llm-api-key:latest" \
  --update-env-vars "LLM_PROVIDER=${LLM_PROVIDER},LLM_MODEL=${LLM_MODEL},STORAGE_DRIVER=gcs,GCS_BUCKET=${BUCKET},UPLOAD_RETENTION_HOURS=24"
API_URL="$(gcloud run services describe invoiceflow-api --region "$REGION" --format 'value(status.url)')"

step "Deploying invoiceflow-web"
gcloud run deploy invoiceflow-web --region "$REGION" --image "${REGISTRY}/web:${TAG}" \
  --allow-unauthenticated --max-instances 3 --timeout 3600 --update-env-vars "API_URL=${API_URL}"
WEB_URL="$(gcloud run services describe invoiceflow-web --region "$REGION" --format 'value(status.url)')"

gcloud run services update invoiceflow-api --region "$REGION" \
  --update-env-vars "APP_BASE_URL=${WEB_URL}" >/dev/null

step "Seeding the demo workspace if it is empty"
if [[ "$(curl -fsS "${API_URL}/stats" | grep -o '"total":[0-9]*')" == '"total":0' ]]; then
  curl -fsS -X POST "${API_URL}/demo/reset" && echo
fi

printf '\nInvoiceFlow is live at %s\n' "$WEB_URL"

#!/usr/bin/env bash
# One-time authorization of GitHub Actions to update one Firestore project, without JSON keys.
set -Eeuo pipefail
PROJECT_ID="kodomo-reading-shelf-87f11"
FAMILY_ID="${1:-}"
if [[ ! "$FAMILY_ID" =~ ^[A-Za-z0-9]{8,60}$ ]]; then
  echo "Usage: bash reading-shelf/sync/setup-google-identity.sh FAMILY_ID" >&2
  echo "Copy FAMILY_ID from the ?family=... link in the owner's Family management screen." >&2
  exit 2
fi

POOL_ID="reading-shelf-github"
PROVIDER_ID="repo-main"
SA_NAME="reading-shelf-gh-sync"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
printf 'Target GCP project: %s\n' "$PROJECT_ID"
echo "This will create a GitHub-only OIDC trust and grant a dedicated service account the Cloud Datastore User role."
read -r -p "Type YES to authorize: " approval
[[ "$approval" == "YES" ]] || { echo "Cancelled";exit 1; }

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
test -n "$PROJECT_NUMBER"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID"

if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --project="$PROJECT_ID" --display-name="Reading Shelf GitHub updater"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/datastore.user" --quiet

if ! gcloud iam workload-identity-pools describe "$POOL_ID" --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" --project="$PROJECT_ID" --location=global \
    --display-name="Reading Shelf GitHub Actions"
fi

CLAIM_CONDITION="assertion.repository_id=='1366987408' && assertion.repository_owner_id=='115095547' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='miyatayuuma/legacy-games/.github/workflows/reading-shelf-chatgpt-sync.yml@refs/heads/main'"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref"
if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" --attribute-condition="$CLAIM_CONDITION"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" --attribute-condition="$CLAIM_CONDITION"
fi

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/miyatayuuma/legacy-games" \
  --quiet

cat <<ENDVARS

One-time Google Cloud identity setup is complete. Next go to:
  https://github.com/miyatayuuma/legacy-games/settings/variables/actions

Create the following THREE repository variables (Actions):
GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/providers/$PROVIDER_ID
GCP_SYNC_SERVICE_ACCOUNT=$SA_EMAIL
READING_SHELF_FAMILY_ID=$FAMILY_ID

No personal access token or service account key is needed.
Once variables are added, open GitHub Actions -> ChatGPT Book Changes to Firestore -> Run workflow.
ENDVARS

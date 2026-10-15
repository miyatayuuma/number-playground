#!/usr/bin/env bash
# One-time administrator approval. No JSON key, GitHub token or family ID needed.
set -Eeuo pipefail
PROJECT_ID="kodomo-reading-shelf-87f11"
EXPECTED_NUMBER="565070188680"
POOL_ID="reading-shelf-github"
PROVIDER_ID="repo-main"
SA_NAME="reading-shelf-gh-sync"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

ACTUAL_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ "$ACTUAL_NUMBER" != "$EXPECTED_NUMBER" ]]; then
  echo "Project identity mismatch; refusing authorization" >&2
  exit 1
fi
cat <<'PROMPT'
This one-time operation:
  - Trusts GitHub Actions ONLY from miyatayuuma/legacy-games, main branch,
    and the dedicated ChatGPT Book Changes workflow.
  - Creates a dedicated short-lived-credential service account.
  - Allows that account to write Firestore in kodomo-reading-shelf-87f11.
  - Creates NO personal access token or service account key.
  - Does NOT itself change any book or family records.

The Firestore IAM role is project-scoped; restrict GitHub repository write access.
PROMPT
read -r -p "Authorize this one-time connection? Type YES: " answer
if [[ "$answer" != "YES" ]]; then echo "Not authorized"; exit 1; fi

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID"

if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --project="$PROJECT_ID" --display-name="Reading Shelf ChatGPT sync"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA_EMAIL" --role="roles/datastore.user" --quiet

if ! gcloud iam workload-identity-pools describe "$POOL_ID" --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" --project="$PROJECT_ID" --location=global --display-name="Private book updates"
fi
CLAIM_CONDITION="assertion.repository_id=='1366987408' && assertion.repository_owner_id=='115095547' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='miyatayuuma/legacy-games/.github/workflows/reading-shelf-chatgpt-sync.yml@refs/heads/main'"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref"
if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --attribute-mapping="$ATTRIBUTE_MAPPING" --attribute-condition="$CLAIM_CONDITION"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="$ATTRIBUTE_MAPPING" --attribute-condition="$CLAIM_CONDITION"
fi

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project="$PROJECT_ID" --role="roles/iam.workloadIdentityUser" --member="principalSet://iam.googleapis.com/projects/$EXPECTED_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/miyatayuuma/legacy-games" --quiet

echo "SETUP_COMPLETE: One-time administrator authorization is ready."
echo "Return to ChatGPT and say: 権限設定完了"

#!/usr/bin/env bash
REGION=$1
PROFILE=$2
TEMP_FILE=$(uuidgen).json

STATE_MACHINE_ARN=$(aws stepfunctions list-state-machines --output json --profile "$PROFILE" --region "$REGION" | jq -r '.stateMachines | map(select(.name | contains("DataDomain"))) | .[0].stateMachineArn')
STATE_MACHINE_ROLE_ARN=$(aws stepfunctions describe-state-machine --state-machine-arn="$STATE_MACHINE_ARN" --profile "$PROFILE" --region "$REGION" --output json | jq -r '.roleArn')
aws lakeformation get-data-lake-settings --profile "$PROFILE" --region "$REGION" --output json | jq --arg stateMachineRoleArn "$STATE_MACHINE_ROLE_ARN" '.DataLakeSettings | .DataLakeAdmins[.DataLakeAdmins | length] |= .+ {"DataLakePrincipalIdentifier": $stateMachineRoleArn}' > $TEMP_FILE
aws lakeformation put-data-lake-settings --data-lake-settings file://$TEMP_FILE --profile "$PROFILE" --region "$REGION"
rm -f $TEMP_FILE
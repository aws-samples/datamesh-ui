#!/usr/bin/env bash
DATAMESH_UI_VERSION=v1.7.7

npm --version > /dev/null 2>&1 || { echo &2 "[ERROR] npm is missing. aborting..."; exit 1; }
pip3 --version > /dev/null 2>&1 || { echo &2 "[ERROR] pip3 is missing. aborting..."; exit 1; }

if [ ! -f "awscliv2.zip" ]; then
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
  unzip awscliv2.zip
  sudo ./aws/install -i /usr/bin/aws-cli -b /usr/bin
fi

aws --version > /dev/null 2>&1 || { echo &2 "[ERROR] aws is missing. aborting..."; exit 1; }
CENTRAL_ACC_ID=$(aws sts get-caller-identity --profile central --query Account) || { echo &2 "[ERROR] aws profile 'central' is not properly configured. aborting..."; exit 1; }
CENTRAL_ACC_ID=${CENTRAL_ACC_ID//\"/}
CUSTOMER_ACC_ID=$(aws sts get-caller-identity --profile customer --query Account) || { echo &2 "[ERROR] aws profile 'customer' is not properly configured. aborting..."; exit 1; }
CUSTOMER_ACC_ID=${CUSTOMER_ACC_ID//\"/}
AWS_REGION=$(aws configure get region --profile central)

npm install --location=global aws-cdk-lib@2.35.0
npm install --location=global yarn
npm install --location=global @aws-amplify/cli

sudo yum -y install jq
sudo yum -y install expect

aws lakeformation get-data-lake-settings --profile central | jq '.DataLakeSettings|.CreateDatabaseDefaultPermissions=[]|.CreateTableDefaultPermissions=[]|.Parameters+={CROSS_ACCOUNT_VERSION:"2"}' > dl_settings_central.json
aws lakeformation put-data-lake-settings --data-lake-settings file://dl_settings_central.json --profile central

aws lakeformation get-data-lake-settings --profile customer | jq '.DataLakeSettings|.CreateDatabaseDefaultPermissions=[]|.CreateTableDefaultPermissions=[]|.Parameters+={CROSS_ACCOUNT_VERSION:"2"}' > dl_settings_customer.json
aws lakeformation put-data-lake-settings --data-lake-settings file://dl_settings_customer.json --profile customer

rm -rf data*
mkdir -p data-mesh-cdk && cd "$_"
cdk init --language=python && source .venv/bin/activate
pip3 install --upgrade pip

cat <<EOT > requirements.txt
aws-cdk-lib==2.35.0
constructs>=10.0.0,<11.0.0
aws_analytics_reference_architecture==2.4.4
EOT

pip3 install -r requirements.txt
mkdir -p stacks && touch stacks/central.py stacks/customer.py
cat cdk.json | jq --arg centralAccountId "$CENTRAL_ACC_ID" --arg customerAccountId "$CUSTOMER_ACC_ID" '.context += {"central_account_id": $centralAccountId, "customer_account_id": $customerAccountId}' > cdk_temp.json
rm -f cdk.json
mv cdk_temp.json cdk.json

cat <<EOT > stacks/central.py
from aws_cdk import Stack
from constructs import Construct

import aws_analytics_reference_architecture as ara

class CentralGovernanceStack(Stack):
    """This stack provisions Central Governance account for data mesh,
    and creates two Lake Formation tags that will be shared with each data domain."""
    
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # Define LF tags that will be shared with each Data Domain
        tags = [
            ara.LfTag(key="channel", values=["b2b", "b2c"]),
            ara.LfTag(key="confidentiality", values=["sensitive", "non-sensitive"]),
        ]
        
        self.central_gov = ara.CentralGovernance(self, "Mesh", lf_tags=tags)

EOT

cat <<EOT > stacks/customer.py
from aws_cdk import Stack
from constructs import Construct

import aws_analytics_reference_architecture as ara


class CustomerDataDomain(Stack):
    """This stack provisions a Data Domain account for Customer LOB that you will use in this workshop 
    to act as both Producer and Consumer in data mesh context. """

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        CENTRAL_ACC_ID = self.node.try_get_context("central_account_id")
        DATA_DOMAIN_ACC_ID = self.node.try_get_context("customer_account_id")

        domain_name = f"Customer-{DATA_DOMAIN_ACC_ID}"

        self.data_domain = ara.DataDomain(
            self,
            "DataDomain",
            domain_name=domain_name,
            central_account_id=CENTRAL_ACC_ID,
            crawler_workflow=True,
        )
EOT

cat <<EOT > app.py
import os
import aws_cdk as cdk

from stacks.central import CentralGovernanceStack
from stacks.customer import CustomerDataDomain

app = cdk.App()

CENTRAL_ACC_ID = app.node.try_get_context("central_account_id")
CUSTOMER_ACC_ID = app.node.try_get_context("customer_account_id")
REGION = os.environ.get("AWS_REGION") or "us-west-2"

CentralGovernanceStack(
  app, "Central", env=cdk.Environment(account=CENTRAL_ACC_ID, region=REGION)
)

CustomerDataDomain(
  app, "Customer", env=cdk.Environment(account=CUSTOMER_ACC_ID, region=REGION)
)

app.synth()

EOT

cdk bootstrap aws://${CENTRAL_ACC_ID}/${AWS_REGION} --profile central
cdk bootstrap aws://${CUSTOMER_ACC_ID}/${AWS_REGION} --profile customer
cdk deploy Central --require-approval never --profile central
cdk deploy Customer --require-approval never --profile customer

cd ..

cat <<'EOT' > load_seed_data.sh
#!/bin/bash
SOURCE_TABLE="${1}"
TARGET_BUCKET_NAME="${2}"
PROFILE="${3}"
SOURCE_BUCKET="aws-analytics-reference-architecture/datasets/retail/1GB"

echo "Loading ${SOURCE_TABLE} data to ${TARGET_BUCKET_NAME}/data-products/${SOURCE_TABLE}"

FILES="$(aws s3 ls s3://${SOURCE_BUCKET}/${SOURCE_TABLE}/ --request-payer requester --profile ${PROFILE} | awk '{print $4}')"
for f in ${FILES}
do
  echo "Processing ${f}"
  aws s3api copy-object --copy-source ${SOURCE_BUCKET}/${SOURCE_TABLE}/${f} --bucket ${TARGET_BUCKET_NAME} --key data-products/${SOURCE_TABLE}/${f} --request-payer requester --profile ${PROFILE}
done
EOT

chmod +x load_seed_data.sh
./load_seed_data.sh customer clean-${CUSTOMER_ACC_ID}-${AWS_REGION} customer
./load_seed_data.sh customer-address clean-${CUSTOMER_ACC_ID}-${AWS_REGION} customer


git clone https://github.com/aws-samples/datamesh-ui -b $DATAMESH_UI_VERSION
cd datamesh-ui
export MESHBASELINE_SM_ARN=$(aws stepfunctions list-state-machines --profile central | jq -r '.stateMachines | map(select(.stateMachineArn | contains("MeshRegisterDataProduct"))) | .[].stateMachineArn')
export MESHBASELINE_LF_ADMIN=$(aws stepfunctions describe-state-machine --state-machine-arn=$MESHBASELINE_SM_ARN --profile central | jq -r '.roleArn')
export MESHBASELINE_EVENT_BUS_ARN=$(aws events list-event-buses --profile central | jq -r '.EventBuses | map(select(.Name | contains("central-mesh-bus"))) | .[].Arn')
yarn deploy-central \
--profile central \
--parameters centralStateMachineArn=$MESHBASELINE_SM_ARN \
--parameters centralLfAdminRoleArn=$MESHBASELINE_LF_ADMIN \
--parameters centralEventBusArn=$MESHBASELINE_EVENT_BUS_ARN \
--parameters centralOpensearchSize=t3.small.search

export AWSCLOUDFORMATIONCONFIG="{\
\"useProfile\":true,\
\"profileName\":\"central\"\
}"

export AMPLIFYPROVIDERS="{\
\"awscloudformation\":$AWSCLOUDFORMATIONCONFIG\
}"

yarn deploy-ui s3://datamesh-ui-hosting-${CENTRAL_ACC_ID}-${AWS_REGION}/ --profile central

./deployment/verify-lf-admin-list.js central $AWS_REGION
./deployment/verify-lf-admin-list.js customer $AWS_REGION

export REGISTRATION_TOKEN=$(cat src/cfn-output.json | jq -r '.InfraStack.RegistrationToken')
export DOMAIN_DISTRIBUTION=$(aws cloudfront list-distributions --profile central | jq -r '.DistributionList.Items[0].DomainName')
echo https://${DOMAIN_DISTRIBUTION}/?token=${REGISTRATION_TOKEN}
aws secretsmanager list-secrets --profile=customer | jq -r '.SecretList[0].ARN'

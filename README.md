# Data Mesh UI

To deploy the UI, you need backend components from 2 locations, these are as follows:

1. [Analytics Reference Architecture](https://github.com/aws-samples/aws-analytics-reference-architecture)
2. [Backend for Data Mesh UI](https://gitlab.aws.dev/jantan/datamesh-ui)

## Setup

### Build the Analytics Reference Architecture

1. From the `core` folder, run the following: `npx projen build`.
2. Deploy the following components from the `core/lib/datamesh` folder:
    - Center: `cdk deploy --app=integ.central.js --profile <PROFILE_FOR_CENTRAL_ACCOUNT>`
    - Producer: `cdk deploy --debug --app=integ.producer.js --profile <PROFILE_FOR_PRODUCER_ACCOUNT>`

### Build the Data Mesh UI Specific Backend

From the project folder:

1. Central: `yarn deploy-central --profile <PROFILE_FOR_CENTRAL_ACCOUNT> --parameters centralStateMachineArn=<REGISTER_PRODUCT_ARN> --parameters centralLfAdminRoleArn=<LF_ADMIN_ROLE_ARN> --parameters centralEventBusArn=<CENTRAL_EVENTBRIDGE_ARN> --parameters centralOpensearchSize=<OPENSEARCH_CLUSTER_SIZING>`
2. Producer: `yarn deploy-producer --profile <PROFILE_FOR_PRODUCER_ACCOUNT> --parameters centralAccountId=<CENTRAL_ACCOUNT_ID>`
3. Frontend: `yarn deploy-ui`
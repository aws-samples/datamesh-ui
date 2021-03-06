# Data Mesh UI

To deploy the UI, you need backend components from 2 locations, these are as follows:

1. [Analytics Reference Architecture](https://github.com/aws-samples/aws-analytics-reference-architecture)
2. [Backend for Data Mesh UI](https://github.com/aws-samples/datamesh-ui)

## Setup

### Build the Analytics Reference Architecture

1. From the `core` folder, run the following: `npx projen build`.
2. Deploy the following components from the `core/lib/datamesh` folder:
    - Center: `cdk deploy --app=integ.central.js --profile <PROFILE_FOR_CENTRAL_ACCOUNT> --parameters producerAccountId=<DATA_DOMAIN_ACC_ID> --parameters producerRegion=<DATA_DOMAIN_REGION> --parameters consumerAccountId=<DATA_DOMAIN_ACC_ID> --parameters consumerRegion=<DATA_DOMAIN_REGION>`
    - Producer: `cdk deploy --debug --app=integ.producer.js --profile <PROFILE_FOR_PRODUCER_ACCOUNT> --parameters centralAccountId=<CENTRAL_ACC_ID>`
    - Consumer: `cdk deploy --debug --app=integ.consumer.js --profile <PROFILE_FOR_CONSUMER_ACCOUNT> --parameters centralAccountId=<CENTRAL_ACC_ID>`

### Build the Data Mesh UI Specific Backend

From the project folder:

1. Central: `yarn deploy-central --profile <PROFILE_FOR_CENTRAL_ACCOUNT> --parameters centralStateMachineArn=<REGISTER_PRODUCT_ARN> --parameters centralLfAdminRoleArn=<LF_ADMIN_ROLE_ARN> --parameters centralEventBusArn=<CENTRAL_EVENTBRIDGE_ARN> --parameters centralOpensearchSize=<OPENSEARCH_CLUSTER_SIZING>`
2. Producer: `yarn deploy-producer --profile <PROFILE_FOR_PRODUCER_ACCOUNT> --parameters centralAccountId=<CENTRAL_ACCOUNT_ID>`
3. Frontend: `yarn deploy-ui`
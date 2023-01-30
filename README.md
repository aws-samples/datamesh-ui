# Data Mesh UI

## Instructor Deployment
Installation script has been provided in the `instructor` folder. The installation script has been tested in the following environment:

- Cloud9 using AL2
    - Make sure to disable the AWS Managed Credentials before running the deployment instructions.
- EC2 using AL2

The deployment requires the following:

- 2 accounts that you have administrator access to. 1 account is to be used for the Central Governance deployment, and the 2nd account is to bootstrap the customer data domain. The customer data domain would be loaded with an example data set (customer and customer-address) that the participants would be interacting with as part of the workshop.
- The environment where you would be running the installation script from should have Docker installed and should have sufficient capacity and storage (around 20gb free).

### Steps to Deploy

Before starting, make sure you're using the latest tagged release of the installation scripts.

1. Download the `instructor/create_aws_profiles.sh` script.
2. Modify the access credentials for both `central` and `customer`
3. Run the file: `source ./create_aws_profiles.sh`
4. Download the `instructor/install.sh` script.
5. Run the file: `./install.sh`
6. Once the script finishes. You will get 2 outputs:
    1. The UI URL including the registration token. You will need to share the full URL with the participants including the token so they can create their own account.
    2. The Secret Manager ARN of the customer data domain. This is required so you can register the customer data domain in the UI.
7. Once you've logged into the UI, click the **Register Data Domain** button and paste the Secret Manager ARN. This would register the customer data domain.
8. Register the following data products:
    1. `customer` under the **NRAC database**
    2. `customer-address` under the **TBAC database**

## Participants
Workshop instructions can be found via the [Build a Data Mesh Workshop](https://catalog.us-east-1.prod.workshops.aws/workshops/23e6326b-58ee-4ab0-9bc7-3c8d730eb851/en-US)
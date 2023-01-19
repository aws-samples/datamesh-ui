#!/usr/bin/env bash

# Placeholder for AWS credentials environment variables
# export AWS_ACCESS_KEY_ID_CENTRAL="TO_BE_REPLACED"
# export AWS_SECRET_ACCESS_KEY_CENTRAL="TO_BE_REPLACED"
# export AWS_SESSION_TOKEN_CENTRAL="TO_BE_REPLACED"
# export AWS_ACCESS_KEY_ID_CUSTOMER="TO_BE_REPLACED"
# export AWS_SECRET_ACCESS_KEY_CUSTOMER="TO_BE_REPLACED"
# export AWS_SESSION_TOKEN_CUSTOMER="TO_BE_REPLACED"

# Set profile for Central Governance account - *central*
aws configure set profile.central.region us-west-2
if [ ! -z "$AWS_ACCESS_KEY_ID_CENTRAL" ]; then
  aws configure set profile.central.aws_access_key_id $AWS_ACCESS_KEY_ID_CENTRAL
fi
if [ ! -z "$AWS_SECRET_ACCESS_KEY_CENTRAL" ]; then
  aws configure set profile.central.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_CENTRAL
fi
if [ ! -z "$AWS_SESSION_TOKEN_CENTRAL" ]; then
  aws configure set profile.central.aws_session_token $AWS_SESSION_TOKEN_CENTRAL
fi

# Set profile for Customer Data Domain account - *customer*
aws configure set profile.customer.region us-west-2
if [ ! -z "$AWS_ACCESS_KEY_ID_CUSTOMER" ]; then
  aws configure set profile.customer.aws_access_key_id $AWS_ACCESS_KEY_ID_CUSTOMER
fi
if [ ! -z "$AWS_SECRET_ACCESS_KEY_CUSTOMER" ]; then
  aws configure set profile.customer.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_CUSTOMER
fi
if [ ! -z "$AWS_SESSION_TOKEN_CUSTOMER" ]; then
  aws configure set profile.customer.aws_session_token $AWS_SESSION_TOKEN_CUSTOMER
fi

# Validate profiles have been installed properly
aws sts get-caller-identity --profile central > /dev/null 2>&1 || { echo &2 "[ERROR] aws profile 'central' is not properly configured. aborting..."; exit 1; }
aws sts get-caller-identity --profile customer > /dev/null 2>&1 || { echo &2 "[ERROR] aws profile 'customer' is not properly configured. aborting..."; exit 1; }

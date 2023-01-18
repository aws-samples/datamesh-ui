#!/usr/bin/env bash

# Set environment variables
export AWS_REGION=us-west-2

# Set profile for Central Governance account - *central*
aws configure set profile.central.aws_access_key_id $AWS_ACCESS_KEY_ID_CENTRAL
aws configure set profile.central.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_CENTRAL
aws configure set profile.central.aws_session_token $AWS_SESSION_TOKEN_CENTRAL
aws configure set profile.central.region $AWS_REGION

CENTRAL_ACC_ID=$(aws sts get-caller-identity --profile central --query Account)
export CENTRAL_ACC_ID=${CENTRAL_ACC_ID//\"/}

# Set profile for Customer Data Domain account - *customer*
aws configure set profile.customer.aws_access_key_id $AWS_ACCESS_KEY_ID_CUSTOMER
aws configure set profile.customer.aws_secret_access_key $AWS_SECRET_ACCESS_KEY_CUSTOMER
aws configure set profile.customer.aws_session_token $AWS_SESSION_TOKEN_CUSTOMER
aws configure set profile.customer.region $AWS_REGION

CUSTOMER_ACC_ID=$(aws sts get-caller-identity --profile customer --query Account)
export CUSTOMER_ACC_ID=${CUSTOMER_ACC_ID//\"/}

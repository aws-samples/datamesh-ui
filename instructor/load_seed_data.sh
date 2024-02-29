#!/bin/bash
TARGET_BUCKET_NAME="${1}"
DATA_LOCATION="${2}"
PRODUCT_NAME="${3}"
PROFILE="${4}"

aws s3 cp --recursive ${DATA_LOCATION} s3://${TARGET_BUCKET_NAME}/data-products/${PRODUCT_NAME} --request-payer requester --profile ${PROFILE}
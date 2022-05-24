#!/bin/bash
TARGET_BUCKET_NAME=$1

cat > Customer_Dataset_123_dq-validation-report.json <<EOF
{
  "sampleSize": 20000,
  "rulesetResults": [
    {
      "name": "CustomerDQRuleset",
      "description": "Data Quality rule set for Customer dataset",
      "arn": "arn:aws:databrew:eu-west-1:111111111111:ruleset/CustomerDQRuleset",
      "lastModifiedDate": "Fri Apr 08 09:28:20 UTC 2022",
      "ruleResults": [
        {
          "name": "Check Dataset For Duplicate Rows",
          "definition": {
            "Name": "Check Dataset For Duplicate Rows",
            "Disabled": false,
            "CheckExpression": "AGG(DUPLICATE_ROWS_COUNT) <= :val1",
            "SubstitutionMap": {
              ":val1": "0"
            }
          },
          "status": "SUCCEEDED"
        },
        {
          "name": "Check All Columns For Missing Values",
          "definition": {
            "Name": "Check All Columns For Missing Values",
            "Disabled": false,
            "CheckExpression": "AGG(MISSING_VALUES_PERCENTAGE) < :val1",
            "SubstitutionMap": {
              ":val1": "10"
            },
            "ColumnSelectors": [
              {
                "Regex": ".*"
              }
            ]
          },
          "columnResults": [
            {
              "name": "current_addr_sk",
              "status": "SUCCEEDED"
            },
            {
              "name": "customer_id",
              "status": "SUCCEEDED"
            },
            {
              "name": "first_sales_date_sk",
              "status": "SUCCEEDED"
            },
            {
              "name": "first_shipto_date_sk",
              "status": "SUCCEEDED"
            },
            {
              "name": "salutation",
              "status": "SUCCEEDED"
            },
            {
              "name": "preferred_cust_flag",
              "status": "SUCCEEDED"
            },
            {
              "name": "birth_month",
              "status": "SUCCEEDED"
            },
            {
              "name": "birth_year",
              "status": "SUCCEEDED"
            },
            {
              "name": "birth_day",
              "status": "SUCCEEDED"
            },
            {
              "name": "current_cdemo_sk",
              "status": "SUCCEEDED"
            },
            {
              "name": "current_hdemo_sk",
              "status": "SUCCEEDED"
            },
            {
              "name": "birth_country",
              "status": "SUCCEEDED"
            },
            {
              "name": "email_address",
              "status": "SUCCEEDED"
            },
            {
              "name": "login",
              "status": "FAILED"
            },
            {
              "name": "customer_sk",
              "status": "SUCCEEDED"
            },
            {
              "name": "last_name",
              "status": "SUCCEEDED"
            },
            {
              "name": "first_name",
              "status": "SUCCEEDED"
            },
            {
              "name": "last_review_date_sk",
              "status": "SUCCEEDED"
            }
          ],
          "status": "FAILED"
        },
        {
          "name": "Check first_name For String Length",
          "definition": {
            "Name": "Check first_name For String Length",
            "Disabled": false,
            "CheckExpression": "LENGTH(:col1) > :val1",
            "SubstitutionMap": {
              ":col1": "\`first_name\`",
              ":val1": "1"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 100
            }
          },
          "failedCount": 727,
          "status": "FAILED"
        },
        {
          "name": "Check last_name For String Length",
          "definition": {
            "Name": "Check last_name For String Length",
            "Disabled": false,
            "CheckExpression": "LENGTH(:col1) > :val1",
            "SubstitutionMap": {
              ":col1": "\`last_name\`",
              ":val1": "1"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 100
            }
          },
          "failedCount": 714,
          "status": "FAILED"
        },
        {
          "name": "Check birth_day For Values In Range",
          "definition": {
            "Name": "Check birth_day For Values In Range",
            "Disabled": false,
            "CheckExpression": ":col1 IS BETWEEN :val1 AND :val2",
            "SubstitutionMap": {
              ":col1": "\`birth_day\`",
              ":val1": "1",
              ":val2": "31"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 100
            }
          },
          "failedCount": 762,
          "status": "FAILED"
        },
        {
          "name": "Check birth_month For Values In Range",
          "definition": {
            "Name": "Check birth_month For Values In Range",
            "Disabled": false,
            "CheckExpression": ":col1 IS BETWEEN :val1 AND :val2",
            "SubstitutionMap": {
              ":col1": "\`birth_month\`",
              ":val1": "1",
              ":val2": "12"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 100
            }
          },
          "failedCount": 746,
          "status": "FAILED"
        },
        {
          "name": "Check email_address For Unique Values",
          "definition": {
            "Name": "Check email_address For Unique Values",
            "Disabled": false,
            "CheckExpression": "AGG(:col1, UNIQUE_VALUES_PERCENTAGE) >= :val1",
            "SubstitutionMap": {
              ":col1": "\`email_address\`",
              ":val1": "95"
            }
          },
          "status": "SUCCEEDED"
        },
        {
          "name": "Check email_address For String Length",
          "definition": {
            "Name": "Check email_address For String Length",
            "Disabled": false,
            "CheckExpression": "LENGTH(:col1) <= :val2",
            "SubstitutionMap": {
              ":col1": "\`email_address\`",
              ":val2": "250"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 100
            }
          },
          "failedCount": 737,
          "status": "FAILED"
        }
      ],
      "status": "FAILED"
    }
  ],
  "jobName": "CustomerProfileJob",
  "jobRunId": "db_1508d6dcccb2dcba6f5eb9d7a8c1cbecf1c57df47c13bf040730acb9dcc2d5f8",
  "location": "s3://$TARGET_BUCKET_NAME/profile-output/tpcds/customer/Customer_Dataset_123_dq-validation-report.json",
  "startedOn": "2022-04-08T09:29:14.424483",
  "writtenOn": "2022-04-08T09:30:28.801301",
  "version": "1.0"
}
EOF

cat > Customer_Dataset_124_dq-validation-report.json <<EOF
{
  "sampleSize": 20000,
  "rulesetResults": [
    {
      "name": "CustomerDQRuleset",
      "description": "Data Quality rule set for Customer dataset",
      "arn": "arn:aws:databrew:eu-west-1:111111111111:ruleset/CustomerDQRuleset",
      "lastModifiedDate": "Fri Apr 08 09:34:54 UTC 2022",
      "ruleResults": [
        {
          "name": "Check Dataset For Duplicate Rows",
          "definition": {
            "Name": "Check Dataset For Duplicate Rows",
            "Disabled": false,
            "CheckExpression": "AGG(DUPLICATE_ROWS_COUNT) <= :val1",
            "SubstitutionMap": {
              ":val1": "0"
            }
          },
          "status": "SUCCEEDED"
        },
        {
          "name": "Check first_name For String Length",
          "definition": {
            "Name": "Check first_name For String Length",
            "Disabled": false,
            "CheckExpression": "LENGTH(:col1) > :val1",
            "SubstitutionMap": {
              ":col1": "\`first_name\`",
              ":val1": "1"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 95
            }
          },
          "failedCount": 715,
          "status": "SUCCEEDED"
        },
        {
          "name": "Check last_name For String Length",
          "definition": {
            "Name": "Check last_name For String Length",
            "Disabled": false,
            "CheckExpression": "LENGTH(:col1) > :val1",
            "SubstitutionMap": {
              ":col1": "\`last_name\`",
              ":val1": "1"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 95
            }
          },
          "failedCount": 719,
          "status": "SUCCEEDED"
        },
        {
          "name": "Check birth_day For Values In Range",
          "definition": {
            "Name": "Check birth_day For Values In Range",
            "Disabled": false,
            "CheckExpression": ":col1 IS BETWEEN :val1 AND :val2",
            "SubstitutionMap": {
              ":col1": "\`birth_day\`",
              ":val1": "1",
              ":val2": "31"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 95
            }
          },
          "failedCount": 691,
          "status": "SUCCEEDED"
        },
        {
          "name": "Check birth_month For Values In Range",
          "definition": {
            "Name": "Check birth_month For Values In Range",
            "Disabled": false,
            "CheckExpression": ":col1 IS BETWEEN :val1 AND :val2",
            "SubstitutionMap": {
              ":col1": "\`birth_month\`",
              ":val1": "1",
              ":val2": "12"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 95
            }
          },
          "failedCount": 688,
          "status": "SUCCEEDED"
        },
        {
          "name": "Check email_address For Unique Values",
          "definition": {
            "Name": "Check email_address For Unique Values",
            "Disabled": false,
            "CheckExpression": "AGG(:col1, UNIQUE_VALUES_PERCENTAGE) >= :val1",
            "SubstitutionMap": {
              ":col1": "\`email_address\`",
              ":val1": "95"
            }
          },
          "status": "SUCCEEDED"
        },
        {
          "name": "Check email_address For String Length",
          "definition": {
            "Name": "Check email_address For String Length",
            "Disabled": false,
            "CheckExpression": "LENGTH(:col1) <= :val2",
            "SubstitutionMap": {
              ":col1": "\`email_address\`",
              ":val2": "250"
            },
            "Threshold": {
              "Type": "GREATER_THAN_OR_EQUAL",
              "Unit": "PERCENTAGE",
              "Value": 95
            }
          },
          "failedCount": 697,
          "status": "SUCCEEDED"
        }
      ],
      "status": "SUCCEEDED"
    }
  ],
  "jobName": "CustomerProfileJob",
  "jobRunId": "db_70aeff55cd9784c478c6d7e92eca0427191edb47540d10b5608479d2e30b35ab",
  "location": "s3://$TARGET_BUCKET_NAME/profile-output/tpcds/customer/Customer_Dataset_124_dq-validation-report.json",
  "startedOn": "2022-04-08T09:35:52.335590",
  "writtenOn": "2022-04-08T09:37:11.500318",
  "version": "1.0"
}
EOF

aws s3 cp Customer_Dataset_123_dq-validation-report.json s3://$TARGET_BUCKET_NAME/profile-output/tpcds/customer/Customer_Dataset_123_dq-validation-report.json --profile $2
aws s3 cp Customer_Dataset_124_dq-validation-report.json s3://$TARGET_BUCKET_NAME/profile-output/tpcds/customer/Customer_Dataset_124_dq-validation-report.json --profile $2

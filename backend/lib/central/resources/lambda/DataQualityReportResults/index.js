/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

const AWS = require('aws-sdk');
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
const util = require('util');
const sts = new AWS.STS();

function parseRuleResult(ruleResult)
{
    const definition = ruleResult.definition;
    const checkExpression = definition.CheckExpression;
    const substitutionMap = definition.SubstitutionMap;
    const threshold = definition.Threshold;

    // Regex for Check Expressions
    const RULE_EXPRESSION_COUNT_REGEX = /(AGG)\((ROWS_COUNT|COLUMNS_COUNT|DUPLICATE_ROWS_COUNT|MISSING_VALUES_COUNT|DUPLICATE_VALUES_COUNT|VALID_VALUES_COUNT|DISTINCT_VALUES_COUNT|UNIQUE_VALUES_COUNT)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_COLUMN_COUNT_REGEX = /(AGG)\((:col[1-9][0-9]?),[ ](DUPLICATE_ROWS_COUNT|MISSING_VALUES_COUNT|DUPLICATE_VALUES_COUNT|VALID_VALUES_COUNT|DISTINCT_VALUES_COUNT|UNIQUE_VALUES_COUNT)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
   
    const RULE_EXPRESSION_PERCENTAGE_REGEX = /(AGG)\((DUPLICATE_ROWS_PERCENTAGE|MISSING_VALUES_PERCENTAGE|DUPLICATE_VALUES_PERCENTAGE|VALID_VALUES_PERCENTAGE|DISTINCT_VALUES_PERCENTAGE|UNIQUE_VALUES_PERCENTAGE)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_COLUMN_PERCENTAGE_REGEX = /(AGG)\((:col[1-9][0-9]?),[ ](DUPLICATE_ROWS_PERCENTAGE|MISSING_VALUES_PERCENTAGE|DUPLICATE_VALUES_PERCENTAGE|VALID_VALUES_PERCENTAGE|DISTINCT_VALUES_PERCENTAGE|UNIQUE_VALUES_PERCENTAGE)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    
    const RULE_EXPRESSION_OUTLIERS_PERCENTAGE_REGEX = /(AGG)\((Z_SCORE_OUTLIERS_PERCENTAGE)[,][ ](:param[1-9][0-9]?)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_COLUMN_OUTLIERS_PERCENTAGE_REGEX = /(AGG)\((:col[1-9][0-9]?)[,][ ](Z_SCORE_OUTLIERS_PERCENTAGE)[,][ ](:param[1-9][0-9]?)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/

    const RULE_EXPRESSION_OUTLIERS_COUNT_REGEX = /(AGG)\((Z_SCORE_OUTLIERS_COUNT)[,][ ](:param[1-9][0-9]?)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_COLUMN_OUTLIERS_COUNT_REGEX = /(AGG)\((:col[1-9][0-9]?)[,][ ](Z_SCORE_OUTLIERS_COUNT)[,][ ](:param[1-9][0-9]?)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/

    // Value Distribution Statistics
    const RULE_EXPRESSION_VALUE_DISTRIBUTION_STATISTIC_REGEX = /(AGG)\((MIN|MAX|MEDIAN|MEAN|MODE|STANDARD_DEVIATION|ENTROPY)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_COLUMN_VALUE_DISTRIBUTION_STATISTIC_REGEX = /(AGG)\((:col[1-9][0-9]?)[,][ ](MIN|MAX|MEDIAN|MEAN|MODE|STANDARD_DEVIATION|ENTROPY)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/

    // Numerical statistics
    const RULE_EXPRESSION_NUMERICAL_DISTRIBUTION_STATISTIC_REGEX = /(AGG)\((SUM|KURTOSIS|SKEWNESS|VARIANCE|MODE|ABSOLUTE_DEVIATION)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_COLUMN_NUMERICAL_DISTRIBUTION_STATISTIC_REGEX = /(AGG)\((:col[1-9][0-9]?)[,][ ](SUM|KURTOSIS|SKEWNESS|VARIANCE|MODE|ABSOLUTE_DEVIATION)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/

    // TODO : Not inline with other Value Distribution Stats - didn't work in console
    const RULE_EXPRESSION_VALUE_DISTRIBUTION_STATS_QUANTILE = /(AGG)(\(QUANTILE\))[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    
    const RULE_EXPRESSION_VALUE_IS_EXACTLY_REGEX = /(:col[1-9][0-9]?)[ ](IN)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_VALUE_IS_NOT_EXACTLY_REGEX = /(:col[1-9][0-9]?)[ ](NOT IN)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_STRING_VALUES_REGEX = /(:col[1-9][0-9]?)[ ](STARTS_WITH|CONTAINS)[ ](:val[1-9][0-9]?)/
    
    const RULE_EXPRESSION_NUMERIC_VALUE_IS_BETWEEN_REGEX = /(:col[1-9][0-9]?)[ ](IS BETWEEN)[ ](:val[1-9][0-9]?)[ ](AND)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_NUMERIC_VALUE_COMPARATOR_REGEX = /(:col[1-9][0-9]?)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    
    const RULE_EXPRESSION_VALUE_STRING_LENGTH_IS_BETWEEN_REGEX = /LENGTH\((:col[1-9][0-9]?)\)[ ](IS BETWEEN)[ ](:val[1-9][0-9]?)[ ](AND)[ ](:val[1-9][0-9]?)/
    const RULE_EXPRESSION_VALUE_STRING_LENGTH_COMPARATOR_REGEX = /LENGTH\((:col[1-9][0-9]?)\)[ ](==|>=|<=|>|<|!=)[ ](:val[1-9][0-9]?)/
    
    var col1;
    var col2;
    var col3;
    var val1;
    var val2;
    var val3;
    var param1;
    var param2;
    var param3;
    var dataQualityCheck;
    var statistic;
    var threshold_type;
    var threshold_value;
    var threshold_unit;
    var outputString = '';
    
    var matchResult;
    var comparator;
    
   
    switch(checkExpression)
    {
        case checkExpression.match(RULE_EXPRESSION_COUNT_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_COUNT_REGEX);
            dataQualityCheck = matchResult[2].toLowerCase().replace(/_/g, ' ');
            comparator = matchResult[3];
            val1 = substitutionMap[matchResult[4]];
            outputString += `Check if ${dataQualityCheck} ${comparator} ${val1}`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_PERCENTAGE_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_PERCENTAGE_REGEX);
            dataQualityCheck = matchResult[2].toLowerCase().replace(/_/g, ' ');
            comparator = matchResult[3];
            val1 = substitutionMap[matchResult[4]];
            outputString += `Check if ${dataQualityCheck} ${comparator} ${val1}%`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_COLUMN_COUNT_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_COLUMN_COUNT_REGEX);
            dataQualityCheck = matchResult[3].toLowerCase().replace(/_/g, ' ');
            comparator = matchResult[4];
            col1 = substitutionMap[matchResult[2]];
            val1 = substitutionMap[matchResult[5]];
            outputString += `Check if ${col1} has ${dataQualityCheck} ${comparator} ${val1}`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_COLUMN_PERCENTAGE_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_COLUMN_PERCENTAGE_REGEX);
            dataQualityCheck = matchResult[3].toLowerCase().replace(/_/g, ' ');
            comparator = matchResult[4];
            col1 = substitutionMap[matchResult[2]];
            val1 = substitutionMap[matchResult[5]];
            outputString += `Check if ${col1} has ${dataQualityCheck} ${comparator} ${val1}%`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_OUTLIERS_PERCENTAGE_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_OUTLIERS_PERCENTAGE_REGEX);
            param1 = substitutionMap[matchResult[3]];
            comparator = matchResult[4];
            val1 = substitutionMap[matchResult[5]];
            outputString += `Check if columns have % of outliers exceeding z-threshold of ${param1} ${comparator} ${val1}%`;
            break;
        case checkExpression.match(RULE_EXPRESSION_OUTLIERS_COUNT_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_OUTLIERS_COUNT_REGEX);
            param1 = substitutionMap[matchResult[3]];
            comparator = matchResult[4];
            val1 = substitutionMap[matchResult[5]];
            outputString += `Check if columns have count of outliers exceeding z-threshold of ${param1} ${comparator} ${val1}`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_COLUMN_OUTLIERS_PERCENTAGE_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_COLUMN_OUTLIERS_PERCENTAGE_REGEX);
            col1 = substitutionMap[matchResult[2]];
            param1 = substitutionMap[matchResult[4]];
            comparator = matchResult[5];
            val1 = substitutionMap[matchResult[6]];
            outputString += `Check if ${col1} has a % of outliers exceeding z-threshold of ${param1} ${comparator} ${val1}%`;
            break;
        case checkExpression.match(RULE_EXPRESSION_COLUMN_OUTLIERS_COUNT_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_COLUMN_OUTLIERS_COUNT_REGEX);
            col1 = substitutionMap[matchResult[2]];
            param1 = substitutionMap[matchResult[4]];
            comparator = matchResult[5];
            val1 = substitutionMap[matchResult[6]];
            outputString += `Check if ${col1} has a count of outliers exceeding z-threshold of ${param1} ${comparator} ${val1}`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_VALUE_DISTRIBUTION_STATISTIC_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_VALUE_DISTRIBUTION_STATISTIC_REGEX);
            statistic = matchResult[2];
            comparator = matchResult[3];
            val1 = substitutionMap[matchResult[4]];
            outputString += `Check if columns have ${statistic} ${comparator} ${val1}`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_COLUMN_VALUE_DISTRIBUTION_STATISTIC_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_COLUMN_VALUE_DISTRIBUTION_STATISTIC_REGEX);
            col1 = substitutionMap[matchResult[2]];
            statistic = matchResult[3];
            comparator = matchResult[4];
            val1 = substitutionMap[matchResult[5]];
            outputString += `Check if ${col1} has ${statistic} ${comparator} ${val1}`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_NUMERICAL_DISTRIBUTION_STATISTIC_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_NUMERICAL_DISTRIBUTION_STATISTIC_REGEX);
            statistic = matchResult[2];
            comparator = matchResult[3];
            val1 = substitutionMap[matchResult[4]];
            outputString += `Check if columns have ${statistic} ${comparator} ${val1}`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_COLUMN_NUMERICAL_DISTRIBUTION_STATISTIC_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_COLUMN_NUMERICAL_DISTRIBUTION_STATISTIC_REGEX);
            col1 = substitutionMap[matchResult[2]];
            statistic = matchResult[3];
            comparator = matchResult[4];
            val1 = substitutionMap[matchResult[5]];
            outputString += `Check if ${col1} has ${statistic} ${comparator} ${val1}`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_VALUE_IS_EXACTLY_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_VALUE_IS_EXACTLY_REGEX);
            comparator = matchResult[2];
            col1 = substitutionMap[matchResult[1]];
            val1 = substitutionMap[matchResult[3]];
            threshold_type = threshold['Type'].toLowerCase().replace(/_/g, ' ');;
            threshold_value = threshold['Value'];
            threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
            outputString += `Check if ${col1} has values contained within ${val1} FOR ${threshold_type} to ${threshold_value}${threshold_unit} of rows`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_VALUE_IS_NOT_EXACTLY_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_VALUE_IS_NOT_EXACTLY_REGEX);
            comparator = matchResult[2];
            col1 = substitutionMap[matchResult[1]];
            val1 = substitutionMap[matchResult[3]];
            threshold_type = threshold['Type'].toLowerCase().replace(/_/g, ' ');;
            threshold_value = threshold['Value'];
            threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
            outputString += `Check if ${col1} has values not contained within ${val1} FOR ${threshold_type} to ${threshold_value}${threshold_unit} of rows`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_STRING_VALUES_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_STRING_VALUES_REGEX);
            col1 = substitutionMap[matchResult[1]];
            dataQualityCheck = matchResult[2].toLowerCase().replace(/_/g, ' ');
            val1 = substitutionMap[matchResult[3]];
            threshold_type = threshold['Type'].toLowerCase().replace(/_/g, ' ');;
            threshold_value = threshold['Value'];
            threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
            outputString += `Check if ${col1} has values that ${dataQualityCheck} ${val1} FOR ${threshold_type} to ${threshold_value}${threshold_unit} of rows`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_NUMERIC_VALUE_IS_BETWEEN_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_NUMERIC_VALUE_IS_BETWEEN_REGEX);
            col1 = substitutionMap[matchResult[1]];
            val1 = substitutionMap[matchResult[3]];
            val2 = substitutionMap[matchResult[5]];
            threshold_type = threshold['Type'].toLowerCase().replace(/_/g, ' ');
            threshold_value = threshold['Value'];
            threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
            outputString += `Check if ${col1} has values between ${val1} and ${val2} FOR ${threshold_type} to ${threshold_value}${threshold_unit} of rows`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_NUMERIC_VALUE_COMPARATOR_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_NUMERIC_VALUE_COMPARATOR_REGEX);
            comparator = matchResult[2];
            col1 = substitutionMap[matchResult[1]];
            val1 = substitutionMap[matchResult[3]];
            threshold_type = threshold['Type'].toLowerCase().replace(/_/g, ' ');
            threshold_value = threshold['Value'];
            threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
            outputString += `Check if ${col1} has values ${comparator} ${val1} FOR ${threshold_type} to ${threshold_value}${threshold_unit} of rows`;
            break;
            
        case checkExpression.match(RULE_EXPRESSION_VALUE_STRING_LENGTH_IS_BETWEEN_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_VALUE_STRING_LENGTH_IS_BETWEEN_REGEX);
            col1 = substitutionMap[matchResult[1]];
            val1 = substitutionMap[matchResult[3]];
            val2 = substitutionMap[matchResult[5]];
            threshold_type = threshold['Type'].toLowerCase().replace(/_/g, ' ');
            threshold_value = threshold['Value'];
            threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
            outputString += `Check if length of ${col1} is between ${val1} and ${val2} FOR ${threshold_type} to ${threshold_value}${threshold_unit} of rows`;
            break;
        
        case checkExpression.match(RULE_EXPRESSION_VALUE_STRING_LENGTH_COMPARATOR_REGEX)?.input:
            matchResult = checkExpression.match(RULE_EXPRESSION_VALUE_STRING_LENGTH_COMPARATOR_REGEX);
            comparator = matchResult[2];
            col1 = substitutionMap[matchResult[1]];
            val1 = substitutionMap[matchResult[3]];
            threshold_type = threshold['Type'].toLowerCase().replace(/_/g, ' ');
            threshold_value = threshold['Value'];
            threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
            outputString += `Check if length of ${col1} ${comparator} ${val1} FOR ${threshold_type} to ${threshold_value}${threshold_unit} of rows`;
            break;
            
        case 'OR':
            outputString += ' OR ';
            break;
        case 'AND':
            outputString += ' AND ';
            break;
        default:
            outputString += checkExpression;
            break;
    }
  
    return outputString;
}


exports.handler = (event, context, callback) => {
    
    const owner = event.queryStringParameters['owner'];
    const bucketName = decodeURIComponent(event.queryStringParameters['bucket']);
    const key = decodeURIComponent(event.queryStringParameters['key']);
    
    const bucketArn = "arn:aws:s3:::"+bucketName;
    const roleArn = util.format("arn:aws:iam::%s:role/ProducerWorkflowRole", owner);
    const s3 = new AWS.S3();

    var params = {
        Bucket: bucketName, 
        Key: key
    };

    s3
        .getObject(params)
        .promise()
        .then(function(reportResultsObject) {
            var jsonObject = JSON.parse(reportResultsObject.Body.toString());
            var sampleSize =  jsonObject.sampleSize;
            var rulesetResults = jsonObject.rulesetResults;
            var ruleResults = rulesetResults[0].ruleResults;
            var ruleCount = 0;
      
            var ruleResultsArray = [];
            
            ruleResults.forEach(function(rule) {
              
              var ruleResult = {
                  
                name: rule.name,
                ruleset_name: rulesetResults.name,
                status : rule.status,
                sample_size : sampleSize,
                definition : rule.definition,
                failed_count : rule.failedCount,
                column_results : rule.columnResults,
                rule_result_string: parseRuleResult(rule)
              }
              
              console.log(rule.definition);
              
              ruleResultsArray.push(ruleResult);
            });
            
            var reportResults =
            {
                owner: owner,
                sample_size: sampleSize,
                report_status: rulesetResults[0].status,
                job_name: jsonObject.jobName,
                job_run_id: jsonObject.jobRunId,
                location: jsonObject.location,
                started_on: jsonObject.startedOn,
                written_on: jsonObject.writtenOn,
                rule_results : ruleResultsArray
            }
            
            callback(null, {
                      statusCode: 201,
                      body: JSON.stringify(reportResults),
                      headers: {
                          'Access-Control-Allow-Origin': '*',
                      },
              });
        }).catch((err) => {
            console.error(err);
        });
};
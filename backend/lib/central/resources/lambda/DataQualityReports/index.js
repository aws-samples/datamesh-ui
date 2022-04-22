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
const util = require("util");

const sts = new AWS.STS();

exports.handler = (event, context, callback) => {
    
    const producerAccountId = event.queryStringParameters['owner'];
    const tableLocation = decodeURIComponent(event.queryStringParameters['tableLocation']);
    const params = getDataReportsLocationParams(tableLocation);
    
    const bucketArn = "arn:aws:s3:::"+params.Bucket;
    const roleArn = util.format("arn:aws:iam::%s:role/ProducerWorkflowRole", producerAccountId);
    
    const assumeRolePromise = sts.assumeRole({
        RoleArn: roleArn,
        RoleSessionName: util.format("ProducerWorkflowRole-AssumedRole-%s", Date.now()),
    }).promise();

    assumeRolePromise.then(function(assumedRole) {
        
        const assumedCredentials = assumedRole.Credentials;
        
        const s3 = new AWS.S3({
            accessKeyId: assumedCredentials.AccessKeyId,
            secretAccessKey: assumedCredentials.SecretAccessKey,
            sessionToken: assumedCredentials.SessionToken
        });
    
        
        return s3.listObjectsV2(params).promise();
    }).then(function(s3ObjectList) {
        
        var dataQualityReports = filterObjects(params.Bucket, s3ObjectList);
        
        callback(null, {
                statusCode: 201,
                body: JSON.stringify(dataQualityReports),
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
        });
    }).catch((err) => {
        console.error(err);
    });
};

function getDataReportsLocationParams(tableLocation)
{
    // Check if path is a folder i.e. ends with a trailing slash
    var isFolderLocation = tableLocation.endsWith('/');   

    // Split the path into an array of path parts
    const reportLocationPathParts = tableLocation.split("/");
	const reportLocationBucketName = reportLocationPathParts[2];
    
    // Remove first 2 elements from array
    // This is the s3://bucket-name part of the table location
    reportLocationPathParts.splice(0, 3); 
    
    // If the locaton is an actual object name, then remove then from the end of the array
    if (!isFolderLocation)
    {
        reportLocationPathParts.pop();
    }
    
    // We will build out the assumed path to the data quality reports
    var reportLocationKey =  "profile-output/"; 
    
    // Build the new path for the data quality reports 
    reportLocationPathParts.forEach(function(part) {
        reportLocationKey = reportLocationKey + part + "/";
    });
    
    // Remove extra trailing slash
    if (isFolderLocation) {
    	reportLocationKey = reportLocationKey.slice(0, -1)
    }
    
    return {
        Bucket: reportLocationBucketName,
        Prefix: reportLocationKey
    };
}

function getDataQualityReports(s3, bucket, prefix) {
    
    var dataQualityReports = [];
    
    var params = {
      Bucket: bucket, 
      Prefix: prefix,
    };

    var listObjectsV2Promise = s3.listObjectsV2(params).promise();
    
    listObjectsV2Promise.then(function(data) {
        console.log('Success');
        dataQualityReports = filterObjects(bucket, data);
    }).catch(function(err) {
        console.log(err);
    });
    
    return Promise.resolve(dataQualityReports);
}

function filterObjects(bucket, data)
{
    var contents = data.Contents;
    var dataQualityReports = [];
    
    contents.forEach(function(content) {
        
        var key = content.Key;
       
        if (key.endsWith("_dq-validation-report.json"))
        {
            var dataQualityReport = {
                lastModified : new Date(content.LastModified), 
                key : key,
                bucket : bucket
            };
            
            dataQualityReports.push(dataQualityReport);
        }
        
        // Sort array by date (descending)
        dataQualityReports.sort(function(a, b) {return b.lastModified - a.lastModified});
    });
    
    return dataQualityReports;
}

function toUrlString(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function errorResponse(errorMessage, awsRequestId, callback) {
  callback(null, {
    statusCode: 500,
    body: JSON.stringify({
      Error: errorMessage,
      Reference: awsRequestId,
    }),
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}

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
import { GlueClient, GetTableCommand } from "@aws-sdk/client-glue";
import Amplify, { Auth, API } from "aws-amplify";
import { useEffect, useState } from "react";
import {
    Flashbar,
    BreadcrumbGroup,
    ColumnLayout,
    Container,
    Box,
    SpaceBetween,
    Header,
    Table,
} from "@awsui/components-react";
import { useParams } from "react-router";
import DataQualityChartComponent from "./DataQualityChartComponent";
import DataQualityBadgeStatus from "./DataQualityBadgeStatus";
import DataQualityColumnComponent from "./DataQualityColumnComponent";
import ValueWithLabel from "../ValueWithLabel";
import DatabaseDetailsComponent from "../DatabaseDetailsComponent";

const config = Amplify.configure();

function DataQualityReportResultsComponent(props) {
    const [reportResults, setReportResults] = useState([]);
    const [ruleResults, setRuleResults] = useState([]);
    const [table, setTable] = useState();
    const [reportLocation, setReportLocation] = useState();
    const [tableNotFound, setTableNotFound] = useState(false);
    const [reportNotFound, setReportNotFound] = useState(false);
    const { dbname, tablename, bucket, key } = useParams();

    useEffect(async () => {
        const credentials = await Auth.currentCredentials();
        const glueClient = new GlueClient({
            region: config.aws_project_region,
            credentials: Auth.essentialCredentials(credentials),
        });

        try {
            const response = await glueClient.send(
                new GetTableCommand({ DatabaseName: dbname, Name: tablename })
            );
            const table = response.Table;
            setTable(table);

            setReportLocation(
                "s3://" +
                    decodeURIComponent(bucket) +
                    "/" +
                    decodeURIComponent(key)
            );

            try {
                const currentSession = await Auth.currentSession();
                const token = await currentSession.idToken.jwtToken;

                const requestInfo = {
                    headers: {
                        Authorization: token,
                    },
                    queryStringParameters: {
                        owner: table.Owner,
                        bucket: bucket,
                        key: key,
                    },
                };

                const reportResults = await API.get(
                    "DataQualityAPIGW",
                    "data_quality/report_results",
                    requestInfo
                );
                console.log("Report results : ");
                console.log(reportResults);
                setReportResults(reportResults);
                setRuleResults(reportResults.rule_results);
            } catch (reportRetrievalError) {
                setReportNotFound(true);
            }
        } catch (tableRetrievalError) {
            setTableNotFound(true);
        }
    }, []);

    if (tableNotFound) {
        return (
            <Flashbar
                items={[
                    {
                        header: "Invalid Request",
                        type: "error",
                        content:
                            "There's no table found for the given parameter.",
                    },
                ]}
            />
        );
    } else if (reportNotFound) {
        return (
            <Flashbar
                items={[
                    {
                        header: "Error retrieving report",
                        type: "error",
                        content:
                            "Unable to retrieve reports.  Please check permissions.",
                    },
                ]}
            />
        );
    } else if (table) {
        return (
            <div>
                <BreadcrumbGroup
                    items={[
                        { text: "Databases", href: "/" },
                        { text: dbname, href: "/tables/" + dbname },
                        {
                            text: "Data Quality Reports (" + tablename + ")",
                            href:
                                "/data-quality-reports/" +
                                dbname +
                                "/" +
                                tablename,
                        },
                        { text: "Report" },
                    ]}
                />
                <DatabaseDetailsComponent dbName={dbname} />
                <Box margin={{ top: "l" }}>
                    <Container
                        header={<Header variant="h2">Table Details</Header>}
                    >
                        <ColumnLayout columns={2} variant="text-grid">
                            <SpaceBetween size="m">
                                <ValueWithLabel label="Table">
                                    {tablename}
                                </ValueWithLabel>
                            </SpaceBetween>
                            <SpaceBetween size="m">
                                <ValueWithLabel label="Location">
                                    {table.StorageDescriptor.Location}
                                </ValueWithLabel>
                            </SpaceBetween>
                        </ColumnLayout>
                    </Container>
                </Box>
                <Box margin={{ top: "l" }}>
                    <Container
                        header={
                            <Header variant="h2">
                                Data Quality - Report Details
                            </Header>
                        }
                    >
                        <ColumnLayout columns={2} variant="text-grid">
                            <SpaceBetween size="m">
                                <ValueWithLabel label="Report Status">
                                    <DataQualityBadgeStatus
                                        status={reportResults.report_status}
                                    >
                                        {reportResults.report_status}
                                    </DataQualityBadgeStatus>
                                </ValueWithLabel>
                            </SpaceBetween>
                            <SpaceBetween size="m">
                                <ValueWithLabel label="Report Sample Size">
                                    {reportResults.sample_size}
                                </ValueWithLabel>
                            </SpaceBetween>
                            <SpaceBetween size="m">
                                <ValueWithLabel label="Report Location">
                                    {reportLocation}
                                </ValueWithLabel>
                            </SpaceBetween>
                        </ColumnLayout>
                    </Container>
                </Box>
                <Box margin={{ top: "m" }}>
                    <Table
                        columnDefinitions={[
                            {
                                header: "Status",
                                cell: (item) => (
                                    <DataQualityBadgeStatus
                                        status={item.status}
                                    >
                                        {item.status}
                                    </DataQualityBadgeStatus>
                                ),
                            },
                            {
                                header: "Rule Details",
                                cell: (item) => (
                                    <ul style={{ listStyleType: "none" }}>
                                        <li style={{ margin: "10px 0" }}>
                                            {item.name}
                                        </li>
                                        <li style={{ fontSize: "70%" }}>
                                            {item.rule_result_string}
                                        </li>
                                    </ul>
                                ),
                            },
                            {
                                header: "Column Details",
                                cell: (item) => (
                                    <DataQualityColumnComponent
                                        column_results={item.column_results}
                                    />
                                ),
                            },
                            {
                                header: "Chart",
                                maxWidth: "300px",
                                cell: (item) => (
                                    <DataQualityChartComponent
                                        ruleResult={item}
                                    />
                                ),
                            },
                        ]}
                        items={reportResults.rule_results}
                        header={<Header variant="h2">Report Results</Header>}
                    />
                </Box>
            </div>
        );
    } else {
        return null;
    }
}

export default DataQualityReportResultsComponent;

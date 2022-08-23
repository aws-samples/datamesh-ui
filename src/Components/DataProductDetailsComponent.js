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
import {Amplify, Auth } from "aws-amplify";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
    Box,
    BreadcrumbGroup,
    ColumnLayout,
    Table,
    Container,
    Flashbar,
    Header,
    SpaceBetween,
} from "@cloudscape-design/components";
import ValueWithLabel from "./ValueWithLabel";
import BadgeStatus from "./BadgeStatus";
import axios from "axios";

const cfnOutput = require("../cfn-output.json");
const SearchApiUrl = cfnOutput.InfraStack.SearchApiUrl;
const config = Amplify.configure();

function DataProductDetailsComponent(props) {
    const [detail, setDetail] = useState([]);
    const [input, setInput] = useState();
    const [documentId, setdocumentId] = useState();

    const { dataProduct } = useParams();
    var results = [];

    const [state, setState] = useState([]);

    useEffect(() => {
        async function run() {
            try {
                const baseURL = SearchApiUrl;
                const authToken = `Bearer ${(await Auth.currentSession())
                    .getIdToken()
                    .getJwtToken()}`;
                const response = await axios.get(
                    `${baseURL}document/${dataProduct}`,
                    {
                        headers: {
                            Authorization: authToken,
                        },
                    }
                );
                console.log(response);
                console.log(response.data.tableInformation);
                if (response.data.tableInformation) {
                    setDetail(response.data.tableInformation);
                }
    
                //console.log(response.data[0].tableInformation.databaseName)
            } catch (e) {
                setdocumentId(e);
            }
        }

        run()
    }, []);

    if (documentId) {
        return (
            <Flashbar
                items={[
                    {
                        header: "Invalid Request",
                        type: "error",
                        content: "throw ....",
                    },
                ]}
            />
        );
    } else if (detail.tableDescription) {
        return (
            <div>
                <BreadcrumbGroup
                    items={[
                        { text: "Search", href: "/search" },
                        {
                            text: "Data Product Details",
                            href: "/data-product-details/",
                        },
                    ]}
                />
                <Container
                    header={<Header variant="h2">Data Product Details</Header>}
                >
                    <ColumnLayout columns={2} variant="text-grid">
                        <SpaceBetween size="m">
                            <ValueWithLabel label="Catalog Name">
                                {detail.catalogName}
                            </ValueWithLabel>
                            <ValueWithLabel label="Database Name">
                                {detail.databaseName}
                            </ValueWithLabel>
                            <ValueWithLabel label="Data Product Type">
                                {detail.tableDescription.TableType + ""}
                            </ValueWithLabel>
                            <ValueWithLabel label="Location">
                                {detail.tableDescription.StorageDescriptor
                                    .Location + ""}
                            </ValueWithLabel>
                        </SpaceBetween>
                        <SpaceBetween size="m">
                            <ValueWithLabel label="Table Name">
                                {detail.tableName}
                            </ValueWithLabel>
                            <ValueWithLabel label="Create Time">
                                {detail.tableDescription.CreateTime + ""}
                            </ValueWithLabel>
                            <ValueWithLabel label="Update Time">
                                {detail.tableDescription.UpdateTime + ""}
                            </ValueWithLabel>
                        </SpaceBetween>
                    </ColumnLayout>
                </Container>
                <Box margin={{ top: "m" }}>
                    <Table
                        header={<Header variant="h3">Columns</Header>}
                        items={
                            detail.tableDescription.StorageDescriptor.Columns
                        }
                        columnDefinitions={[
                            {
                                header: "Name",
                                cell: (item) => item.Name,
                            },
                            {
                                header: "Type",
                                cell: (item) => item.Type,
                            },
                            {
                                header: "Description",
                                cell: (item) => "",
                            },
                        ]}
                    />
                </Box>
            </div>
        );
    } else {
        return null;
    }
}
export default DataProductDetailsComponent;

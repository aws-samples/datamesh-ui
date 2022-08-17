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
import axios from "axios";
import {Amplify, Auth } from "aws-amplify";
import { useState } from "react";
import {
    Table,
    Box,
    Container,
    Header,
    Link,
    Autosuggest,
} from "@cloudscape-design/components";

const cfnOutput = require("../cfn-output.json");
const SearchApiUrl = cfnOutput.InfraStack.SearchApiUrl;

const MIN_SEARCH_STRING_LENGTH = 1;

function searchResultsToSelectOptions(searchResults, searchTerm) {
    if (!searchResults) {
        return [];
    }

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const nestedSelectOptions = searchResults.map((searchResult) => {
        const resultArray = [];

        const databaseName = searchResult.tableInformation.databaseName;
        if (databaseName.toLowerCase().includes(lowerCaseSearchTerm)) {
            resultArray.push({
                value: databaseName,
                tags: ["Database"],
            });
        }

        const tableName = searchResult.tableInformation.tableName;
        if (tableName.toLowerCase().includes(lowerCaseSearchTerm)) {
            resultArray.push({
                value: tableName,
                description: `${databaseName}.${tableName}`,
                tags: ["Table"],
            });
        }

        const columnNames = searchResult.tableInformation.columnNames;
        columnNames.forEach((columnName) => {
            if (columnName.toLowerCase().includes(lowerCaseSearchTerm)) {
                resultArray.push({
                    value: columnName,
                    description: `${databaseName}.${tableName}.${columnName}`,
                    tags: ["Column"],
                });
            }
        });

        return resultArray;
    });

    return nestedSelectOptions.flat();
}

function SearchComponent() {
    var results = [];
    var selectionOptions = [];
    const [input, setInput] = useState("");

    const [state, setState] = useState({
        results: [],
        selectionOptions: [],
    });

    console.log("Selection Options", selectionOptions);

    const searchForText = async (text) => {
        const baseURL = SearchApiUrl;
        const authToken = `Bearer ${(await Auth.currentSession())
            .getIdToken()
            .getJwtToken()}`;
        results = await axios.get(`${baseURL}search/${text}`, {
            headers: {
                Authorization: authToken,
            },
        });

        selectionOptions = searchResultsToSelectOptions(results.data, text);

        setState((prevState) => {
            return {
                ...prevState,
                results: results,
                selectionOptions: selectionOptions,
            };
        });
    };

    let data = [];

    if (state.results.data) {
        data = state.results.data || [];
    }

    const onLoadItemsHandler = (event) => {
        console.log("onLoadItemsHandler", event);
        const filterText = event.detail.filteringText || "";

        if (filterText.length < MIN_SEARCH_STRING_LENGTH) {
            return;
        }

        searchForText(filterText);
    };

    const onSelectHandler = (event) => {
        console.log("onSelect", event);
        const selectedValue = event.detail.value || "";

        if (selectedValue) {
            searchForText(selectedValue);
        }
    };

    const onChangeHandler = (event) => {
        console.log("onChange", event);
        const text = event.detail.value;

        if (text.length < MIN_SEARCH_STRING_LENGTH) {
            setState((prevState) => {
                return {
                    ...prevState,
                    results: [],
                    selectionOptions: [],
                };
            });
        }

        setInput(text);
    };

    return (
        <div>
            <Container
                header={<Header variant="h2">Explore Data Products</Header>}
            >
                <Autosuggest
                    autoFocus={true}
                    onLoadItems={onLoadItemsHandler}
                    filteringType="manual"
                    options={state.selectionOptions}
                    value={input}
                    onChange={onChangeHandler}
                    onSelect={onSelectHandler}
                    enteredTextLabel={(value) => value}
                ></Autosuggest>
            </Container>

            <Table
                footer={
                    <Box
                        textAlign="center"
                        display={data ? "block" : "none"}
                    ></Box>
                }
                items={data}
                columnDefinitions={[
                    {
                        header: "Table Name",
                        cell: (item) => (
                            <Link
                                href={
                                    "/data-product-details/" + item.documentId
                                }
                            >
                                {item.tableInformation.tableName}{" "}
                            </Link>
                        ),
                    },
                    {
                        header: "Product Owner ID",
                        cell: (item) => item.tableInformation.catalogName + "",
                    },
                    {
                        header: "Actions",
                        cell: (item) => (
                            <Link
                                variant="primary"
                                href={
                                    "/request-access/" +
                                    item.tableInformation.databaseName +
                                    "/" +
                                    item.tableInformation.tableName
                                }
                            >
                                Request Access
                            </Link>
                        ),
                    },
                    {
                        header: "Database Name",
                        cell: (item) => item.tableInformation.databaseName + "",
                    },
                    {
                        header: "Columns",
                        cell: (item) => item.tableInformation.columnNames + "",
                    },
                ]}
            />
        </div>
    );
}

export default SearchComponent;

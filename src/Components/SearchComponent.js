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
import axios from 'axios'
import Amplify, { Auth } from "aws-amplify";
import { useState } from "react";
import { Table, Box, Container, Header, Input, Link } from "@awsui/components-react";

const cfnOutput = require("../cfn-output.json");
const SEARCH_ARN = cfnOutput.InfraStack.SearchArn;

const config = Amplify.configure();
function SearchComponent() {

  var results = []
  const [input, setInput] = useState('')

  const [state, setState] = useState({
    results: []
  });


  const onSearch = async (text) => {
    
    const baseURL = SEARCH_ARN
    results = await axios.get(`${baseURL}/search/${text}`)
  
    setState(prevState => {
      return { ...prevState, results: results }
    })

  };

  const [searchTerm, setSearchTerm] = useState()

  const changeHandle = (event) => {
    const text = event.detail.value;
    setSearchTerm(text)
    setInput(event.detail.value)
  }
  const handleEnterKeyPressed = (event) => {
    if (event.detail.key === 'Enter') {
      onSearch(searchTerm)
    }
  }

  let data = [];
  
  console.log(state.results.data)
  if (state.results.data) {
    data = state.results.data || [];
  }

  return (

    <div>

      <Container header={<Header variant="h2">Explore Data Products</Header>}>
        <Input type="search" value={input} onKeyDown={handleEnterKeyPressed} onChange={changeHandle}> </Input>
      </Container>

      <Table
        footer={<Box textAlign="center"
          display={(data) ? "block" : "none"}></Box>}
        items={data} columnDefinitions={[
          {
            header: "Table Name",
            cell:  item => <Link href={"/data-product-details/"+item.documentId}>{item.tableInformation.tableName} </Link>
          },
          {
            header: "Product Owner ID",
            cell: item => item.tableInformation.catalogName + ""
          },
          {
            header: "Database Name",
            cell: item => item.tableInformation.databaseName + ""
          },
          {
            header: "Columns",
            cell: item => item.tableInformation.columnNames + ""
          }

        ]} />
    </div>
  );
}

export default SearchComponent;

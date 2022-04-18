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

import { Chart as ChartJS, registerables } from 'chart.js';
import { Bar } from 'react-chartjs-2'
ChartJS.register(...registerables);

const DataQualityChartComponent = ({ruleResult}) => {
    
    const failed_count = ruleResult.failed_count;
    const sample_size = ruleResult.sample_size;
    const threshold = ruleResult.definition.Threshold;
    
    if( threshold != null ){
    
      const threshold_type = threshold['Type'];
      const threshold_value = threshold['Value'];
      const threshold_unit = ((threshold['Unit'] == 'PERCENTAGE') ? '%' : '');
      
      const failedPercentage = Math.round((failed_count / sample_size) *100)
      
      const state = {
        labels: [''],
        datasets: [
          {
            label: '% Succeeded',
            backgroundColor: 'rgba(0, 161, 201,1)',
            borderColor: 'rgba(0,0,0,1)',
            borderWidth: 2,
            data: [100 - failedPercentage]
          },
          {
            label: '% Failed',
            backgroundColor: 'rgba(223, 51, 18,1)',
            borderColor: 'rgba(0,0,0,1)',
            borderWidth: 2,
            data: [failedPercentage]
          }
        ]
      }
      
       return (
              <Bar
                      data={state}
                      height={30}
                      options={
                      {
                        maintainAspectRatio: false,
                        indexAxis: 'y',
                        title:{
                          display:false,
                        },
                        legend:{
                          display:true,
                          position:'top'
                        },
                        scales: {
                          x: {
                            stacked: true,
                            grid: {
                                display: false,
                            }
                          },
                          y: {
                            stacked: true,
                            grid: {
                                display: false,
                            }
                          }
                        }
                      }}
              />
        )
    }
    else
    {
        return null;
    }
}

export default DataQualityChartComponent;

      
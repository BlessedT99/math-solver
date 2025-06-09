const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// FIXED: Main math solver endpoint - now uses Gemini only for reliability
app.post('/solve', async (req, res) => {
  try {
    const { problem } = req.body;
    
    if (!problem) {
      return res.status(400).json({ error: 'Problem statement is required' });
    }

    // Use Gemini for both analysis AND calculation
    const geminiPrompt = `
You are a mathematical expert. Solve this math problem step by step:

Problem: "${problem}"

Please provide your response in this EXACT format:
OPERATION: [the mathematical operation needed]
EXPRESSION: [the clean mathematical expression]
RESULT: [the final answer - for derivatives, provide the derivative expression like "2x + 3"]
STEPS: [detailed step-by-step solution]

Important rules:
- For derivatives: Show the derivative as an algebraic expression (e.g., "2x + 3", not just a number)
- For integration: Include the constant of integration (+C)
- For factoring: Show the factored form
- For simplification: Show the simplified expression
- Always show your work step by step

Example for derivative of x^2 + 3x + 2:
OPERATION: derivative
EXPRESSION: x^2 + 3x + 2  
RESULT: 2x + 3
STEPS: 
1. Apply power rule to x^2: derivative is 2x
2. Apply power rule to 3x: derivative is 3
3. Derivative of constant 2 is 0
4. Combine: 2x + 3 + 0 = 2x + 3
`;

    const geminiResult = await model.generateContent(geminiPrompt);
    const geminiResponse = geminiResult.response.text();
    
    // Parse Gemini's structured response
    const operationMatch = geminiResponse.match(/OPERATION:\s*(.+)/i);
    const expressionMatch = geminiResponse.match(/EXPRESSION:\s*(.+)/i);
    const resultMatch = geminiResponse.match(/RESULT:\s*(.+)/i);
    const stepsMatch = geminiResponse.match(/STEPS:\s*([\s\S]+)/i);
    
    const operation = operationMatch ? operationMatch[1].trim() : 'unknown';
    const expression = expressionMatch ? expressionMatch[1].trim() : problem;
    const result = resultMatch ? resultMatch[1].trim() : 'Could not determine result';
    const steps = stepsMatch ? stepsMatch[1].trim() : 'Steps not provided';
    
    // Validation: Check if result makes sense
    if (operation.toLowerCase().includes('deriv') && /^\d+$/.test(result)) {
      throw new Error('Derivative result should be an expression, not just a number');
    }
    
    // Create explanation
    const explanationPrompt = `
Explain this mathematical solution in clear, educational terms:

Problem: ${problem}
Operation: ${operation}
Expression: ${expression}
Result: ${result}
Steps: ${steps}

Provide a friendly explanation that helps someone understand:
1. What type of problem this is
2. Why the answer is correct
3. Key concepts involved

Keep it conversational and educational.
`;
    
    const explanationResult = await model.generateContent(explanationPrompt);
    const explanation = explanationResult.response.text();
    
    // Build response
    const response = {
      success: true,
      originalProblem: problem,
      analysis: {
        operation: operation,
        expression: expression,
        context: `Solving ${operation} problem`
      },
      calculation: {
        method: 'gemini-ai',
        result: result,
        operation: operation,
        steps: steps
      },
      explanation: explanation,
      rawGeminiResponse: geminiResponse
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error in math solver:', error);
    
    // Fallback: Try a simpler Gemini prompt
    try {
      const fallbackPrompt = `Solve this math problem: ${req.body.problem}`;
      const fallbackResult = await model.generateContent(fallbackPrompt);
      const fallbackResponse = fallbackResult.response.text();
      
      res.json({
        success: true,
        originalProblem: req.body.problem,
        analysis: { operation: 'general', expression: req.body.problem, context: 'Fallback solution' },
        calculation: { method: 'gemini-fallback', result: fallbackResponse, operation: 'solve' },
        explanation: 'Used fallback method to solve the problem.',
        rawGeminiResponse: fallbackResponse
      });
      
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to solve math problem',
        details: error.message 
      });
    }
  }
});

// Endpoint to list available operations
app.get('/operations', (req, res) => {
  res.json({
    availableOperations: ['derive', 'integrate', 'simplify', 'factor', 'solve', 'zeroes'],
    method: 'gemini-ai',
    description: "Operations supported by the Gemini-powered math solver"
  });
});

// Serve the HTML interface at root
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hybrid Math Solver</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .input-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #555;
        }
        input[type="text"], textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            box-sizing: border-box;
        }
        textarea {
            min-height: 100px;
            resize: vertical;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .result {
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .error {
            background: #fee;
            border-left-color: #e74c3c;
        }
        .loading {
            text-align: center;
            color: #666;
        }
        .examples {
            margin-top: 20px;
            padding: 15px;
            background: #e8f4f8;
            border-radius: 8px;
        }
        .example-btn {
            background: #17a2b8;
            padding: 5px 10px;
            margin: 3px;
            font-size: 12px;
            border-radius: 5px;
        }
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            white-space: pre-wrap;
        }
        .status {
            text-align: center;
            color: #28a745;
            font-weight: bold;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧮 Hybrid Math Solver</h1>
        <div class="status">✅ Powered by Google Gemini AI (Fixed Version)</div>
        
        <div class="input-group">
            <label for="problem">Enter your math problem:</label>
            <textarea id="problem" placeholder="Example: Find the derivative of x^2 + 3x + 2"></textarea>
        </div>
        
        <button onclick="solveProblem()" id="solveBtn">🚀 Solve Problem</button>
        
        <div class="examples">
            <strong>Try these examples:</strong><br>
            <button class="example-btn" onclick="setExample('Find the derivative of x^2 + 3x + 2')">Derivative</button>
            <button class="example-btn" onclick="setExample('Simplify (x^2 + 2x + 1)')">Simplify</button>
            <button class="example-btn" onclick="setExample('Factor x^2 + 5x + 6')">Factor</button>
            <button class="example-btn" onclick="setExample('What are the zeros of x^2 - 4?')">Find Zeros</button>
            <button class="example-btn" onclick="setExample('Integrate 2x + 3')">Integrate</button>
        </div>
        
        <div id="result" style="display: none;"></div>
    </div>

    <script>
        const API_BASE = window.location.origin;
        
        function setExample(problem) {
            document.getElementById('problem').value = problem;
        }
        
        async function solveProblem() {
            const problemText = document.getElementById('problem').value.trim();
            const resultDiv = document.getElementById('result');
            const solveBtn = document.getElementById('solveBtn');
            
            if (!problemText) {
                alert('Please enter a math problem!');
                return;
            }
            
            // Show loading
            resultDiv.style.display = 'block';
            resultDiv.className = 'result loading';
            resultDiv.innerHTML = '🔄 Solving your problem...';
            solveBtn.disabled = true;
            
            try {
                const response = await fetch(API_BASE + '/solve', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ problem: problemText })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    resultDiv.className = 'result';
                    resultDiv.innerHTML = \`
                        <h3>✅ Solution</h3>
                        <p><strong>Problem:</strong> \${data.originalProblem}</p>
                        <p><strong>Operation:</strong> \${data.analysis.operation}</p>
                        <p><strong>Expression:</strong> \${data.analysis.expression}</p>
                        <p><strong>Result:</strong> <code>\${data.calculation.result}</code></p>
                        
                        <h4>📖 Explanation:</h4>
                        <div style="background: white; padding: 15px; border-radius: 5px;">
                            \${data.explanation.replace(/\\n/g, '<br>')}
                        </div>
                        
                        <details style="margin-top: 15px;">
                            <summary style="cursor: pointer; font-weight: bold;">🔍 Step-by-Step Solution</summary>
                            <pre>\${data.calculation.steps}</pre>
                        </details>
                        
                        <details style="margin-top: 10px;">
                            <summary style="cursor: pointer; font-weight: bold;">🔧 Technical Details</summary>
                            <pre>\${JSON.stringify(data, null, 2)}</pre>
                        </details>
                    \`;
                } else {
                    throw new Error(data.error || 'Unknown error');
                }
                
            } catch (error) {
                resultDiv.className = 'result error';
                resultDiv.innerHTML = \`
                    <h3>❌ Error</h3>
                    <p><strong>Could not solve the problem:</strong> \${error.message}</p>
                    <p><strong>Make sure your GEMINI_API_KEY is set!</strong></p>
                \`;
            } finally {
                solveBtn.disabled = false;
            }
        }
        
        // Allow Enter key to submit
        document.getElementById('problem').addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                solveProblem();
            }
        });
    </script>
</body>
</html>`);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    services: {
      gemini: !!process.env.GEMINI_API_KEY,
      method: 'gemini-only (newton api removed for reliability)'
    }
  });
});

// Example usage endpoint
app.get('/examples', (req, res) => {
  res.json({
    examples: [
      {
        problem: "Find the derivative of x^2 + 3x + 2",
        expectedOperation: "derivative",
        expectedResult: "2x + 3"
      },
      {
        problem: "Simplify (x^2 + 2x + 1)",
        expectedOperation: "simplify"
      },
      {
        problem: "What are the zeros of x^2 - 4?",
        expectedOperation: "zeroes"
      },
      {
        problem: "Factor x^2 + 5x + 6",
        expectedOperation: "factor"
      },
      {
        problem: "Integrate 2x + 3",
        expectedOperation: "integrate"
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hybrid Math Solver API running on port ${PORT}`);
  console.log(`✅ Fixed version - now using Gemini AI only for reliability`);
  console.log(`Make sure to set GEMINI_API_KEY environment variable`);
});

module.exports = app;
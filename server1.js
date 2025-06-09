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

// Newton API base URL (free, no key required)
const NEWTON_API_BASE = 'https://newton.now.sh/api/v2';

// Newton API operation mappings
const NEWTON_OPERATIONS = {
  'simplify': 'simplify',
  'factor': 'factor', 
  'derive': 'derive',
  'integrate': 'integrate',
  'zeroes': 'zeroes',
  'tangent': 'tangent',
  'area': 'area',
  'cosine': 'cos',
  'sine': 'sin',
  'tangent_trig': 'tan',
  'arccos': 'arccos',
  'arcsin': 'arcsin',
  'arctan': 'arctan',
  'abs': 'abs',
  'log': 'log'
};

// Helper function to call Newton API
async function callNewtonAPI(operation, expression) {
  try {
    const response = await axios.get(`${NEWTON_API_BASE}/${operation}/${encodeURIComponent(expression)}`);
    return response.data;
  } catch (error) {
    throw new Error(`Newton API error: ${error.message}`);
  }
}

// Helper function to parse Gemini response for Newton operations
function parseGeminiResponse(response) {
  const text = response.toLowerCase();
  
  // Extract operation and expression from Gemini's analysis
  let operation = 'simplify'; // default
  let expression = '';
  
  // Look for specific mathematical operations
  if (text.includes('derivative') || text.includes('derive') || text.includes('differentiate')) {
    operation = 'derive';
  } else if (text.includes('integral') || text.includes('integrate')) {
    operation = 'integrate';
  } else if (text.includes('factor')) {
    operation = 'factor';
  } else if (text.includes('zeros') || text.includes('roots')) {
    operation = 'zeroes';
  } else if (text.includes('simplify')) {
    operation = 'simplify';
  }
  
  // Extract mathematical expression (basic regex pattern)
  const expressionMatch = text.match(/([x\d\+\-\*\/\^\(\)\s]+)/);
  if (expressionMatch) {
    expression = expressionMatch[1].trim();
  }
  
  return { operation, expression };
}

// Main math solver endpoint
app.post('/solve', async (req, res) => {
  try {
    const { problem, preferredMethod } = req.body;
    
    if (!problem) {
      return res.status(400).json({ error: 'Problem statement is required' });
    }

    // Step 1: Use Gemini to understand the problem
    const geminiPrompt = `
    Analyze this math problem and determine:
    1. What mathematical operation is needed (simplify, factor, derive, integrate, find zeros, etc.)
    2. Extract the mathematical expression in a clean format
    3. Provide context about the problem type
    
    Problem: "${problem}"
    
    Respond in this format:
    Operation: [operation name]
    Expression: [clean mathematical expression]
    Context: [brief explanation of what needs to be solved]
    `;

    const geminiResult = await model.generateContent(geminiPrompt);
    const geminiResponse = geminiResult.response.text();
    
    // Parse Gemini's response
    const operationMatch = geminiResponse.match(/Operation:\s*(.+)/i);
    const expressionMatch = geminiResponse.match(/Expression:\s*(.+)/i);
    const contextMatch = geminiResponse.match(/Context:\s*(.+)/i);
    
    const operation = operationMatch ? operationMatch[1].trim().toLowerCase() : 'simplify';
    const expression = expressionMatch ? expressionMatch[1].trim() : problem;
    const context = contextMatch ? contextMatch[1].trim() : 'Mathematical computation';
    
    // Map to Newton API operation
    const newtonOp = NEWTON_OPERATIONS[operation] || 'simplify';
    
    // Step 2: Use Newton API for calculation
    let newtonResult;
    try {
      newtonResult = await callNewtonAPI(newtonOp, expression);
    } catch (newtonError) {
      // If Newton fails, try with simplify as fallback
      newtonResult = await callNewtonAPI('simplify', expression);
    }
    
    // Step 3: Use Gemini to provide explanation
    const explanationPrompt = `
    Explain this mathematical solution in simple terms:
    
    Original Problem: ${problem}
    Operation Performed: ${operation}
    Expression: ${expression}
    Result: ${newtonResult.result}
    
    Provide a clear, step-by-step explanation of how this solution was obtained.
    `;
    
    const explanationResult = await model.generateContent(explanationPrompt);
    const explanation = explanationResult.response.text();
    
    // Combine results
    const response = {
      success: true,
      originalProblem: problem,
      analysis: {
        operation: operation,
        expression: expression,
        context: context
      },
      calculation: {
        method: newtonOp,
        result: newtonResult.result,
        operation: newtonResult.operation
      },
      explanation: explanation,
      geminiAnalysis: geminiResponse
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error in math solver:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to solve math problem',
      details: error.message 
    });
  }
});

// Endpoint to list available operations
app.get('/operations', (req, res) => {
  res.json({
    availableOperations: Object.keys(NEWTON_OPERATIONS),
    newtonOperations: Object.values(NEWTON_OPERATIONS),
    description: "Operations supported by the hybrid math solver"
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
    </style>
</head>
<body>
    <div class="container">
        <h1>🧮 Hybrid Math Solver</h1>
        <p style="text-align: center; color: #666;">Powered by Google Gemini AI + Newton API</p>
        
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
                            <summary style="cursor: pointer; font-weight: bold;">🔍 Technical Details</summary>
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
      newton: 'available (no key required)'
    }
  });
});

// Example usage endpoint
app.get('/examples', (req, res) => {
  res.json({
    examples: [
      {
        problem: "Find the derivative of x^2 + 3x + 2",
        expectedOperation: "derive"
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
  console.log(`Make sure to set GEMINI_API_KEY environment variable`);
});

// Add this endpoint to see available models
app.get('/models', async (req, res) => {
  try {
    const models = await genAI.listModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
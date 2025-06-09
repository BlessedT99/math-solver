const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Enhanced CORS configuration using environment variables
app.use((req, res, next) => {
  // Default allowed origins
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
  
  // Get allowed origins from environment variable or use defaults
  const envOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : [];
  
  const allowedOrigins = [...defaultOrigins, ...envOrigins];
  
  // Allow all origins in development
  if (process.env.NODE_ENV === 'development' || process.env.CORS_ALLOW_ALL === 'true') {
    res.header('Access-Control-Allow-Origin', '*');
  } else {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize Gemini AI with error handling and environment configuration
let model;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

try {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY environment variable is not set!');
    console.log('💡 Please set GEMINI_API_KEY in your environment variables');
    if (process.env.NODE_ENV !== 'production') {
      console.log('💡 For development, you can create a .env file with: GEMINI_API_KEY=your_key_here');
    }
    process.exit(1);
  }
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  console.log(`✅ Gemini AI model (${GEMINI_MODEL}) initialized successfully`);
} catch (error) {
  console.error('❌ Failed to initialize Gemini AI:', error.message);
  process.exit(1);
}

// Main math solver endpoint
app.post('/solve', async (req, res) => {
  try {
    const { problem } = req.body;
    
    if (!problem || typeof problem !== 'string' || problem.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Problem statement is required and must be a non-empty string' 
      });
    }

    console.log(`📝 Solving problem: "${problem}"`);

    // Enhanced Gemini prompt for better structured responses
    const geminiPrompt = `
You are a mathematical expert. Solve this math problem step by step and provide a clear, structured response.

Problem: "${problem}"

Please provide your response in this EXACT format:
OPERATION: [the mathematical operation needed - examples: derivative, integral, simplify, factor, solve, find_zeros]
EXPRESSION: [the clean mathematical expression being worked with]
RESULT: [the final answer - for derivatives, provide the derivative expression like "2x + 3"]
STEPS: [detailed step-by-step solution with numbered steps]

Important guidelines:
- For derivatives: Show the derivative as an algebraic expression (e.g., "2x + 3", not just a number)
- For integration: Include the constant of integration (+C) 
- For factoring: Show the factored form clearly
- For simplification: Show the simplified expression
- For finding zeros/roots: List all solutions
- Always show your work step by step with clear explanations
- Use proper mathematical notation

Example for derivative of x^2 + 3x + 2:
OPERATION: derivative
EXPRESSION: x^2 + 3x + 2  
RESULT: 2x + 3
STEPS: 
1. Apply power rule to x^2: derivative is 2x^1 = 2x
2. Apply power rule to 3x: derivative is 3(1)x^0 = 3
3. Derivative of constant 2 is 0
4. Combine terms: 2x + 3 + 0 = 2x + 3

Now solve the given problem following this format exactly.
`;

    const geminiResult = await model.generateContent(geminiPrompt);
    const geminiResponse = geminiResult.response.text();
    
    console.log('🤖 Gemini raw response:', geminiResponse);
    
    // Enhanced parsing with better error handling
    const operationMatch = geminiResponse.match(/OPERATION:\s*(.+?)(?=\n|$)/i);
    const expressionMatch = geminiResponse.match(/EXPRESSION:\s*(.+?)(?=\n|$)/i);
    const resultMatch = geminiResponse.match(/RESULT:\s*(.+?)(?=\n|$)/i);
    const stepsMatch = geminiResponse.match(/STEPS:\s*([\s\S]+?)(?=\n\n|\n[A-Z]+:|$)/i);
    
    const operation = operationMatch ? operationMatch[1].trim() : 'mathematical_operation';
    const expression = expressionMatch ? expressionMatch[1].trim() : problem.trim();
    const result = resultMatch ? resultMatch[1].trim() : 'Solution provided in explanation';
    const steps = stepsMatch ? stepsMatch[1].trim() : 'Detailed steps provided in explanation below';
    
    console.log('📊 Parsed results:', { operation, expression, result });
    
    // Validation for common issues
    if (operation.toLowerCase().includes('deriv') && /^\d+$/.test(result)) {
      console.warn('⚠️ Derivative result appears to be just a number, this might be incorrect');
    }
    
    // Generate user-friendly explanation
    const explanationPrompt = `
Create a clear, educational explanation for this mathematical solution:

Problem: ${problem}
Operation: ${operation}
Mathematical Expression: ${expression}
Final Result: ${result}
Solution Steps: ${steps}

Provide a friendly, conversational explanation that:
1. Identifies what type of mathematical problem this is
2. Explains the approach used to solve it
3. Clarifies why the answer is correct
4. Mentions any key mathematical concepts or rules involved
5. Uses clear, educational language suitable for students

Keep the explanation concise but informative, around 3-4 sentences.
`;
    
    const explanationResult = await model.generateContent(explanationPrompt);
    const explanation = explanationResult.response.text();
    
    // Build comprehensive response
    const response = {
      success: true,
      originalProblem: problem,
      analysis: {
        operation: operation,
        expression: expression,
        context: `Solving ${operation} problem using AI analysis`
      },
      calculation: {
        method: 'gemini-ai-enhanced',
        result: result,
        operation: operation,
        steps: steps,
        confidence: 'high'
      },
      explanation: explanation,
      timestamp: new Date().toISOString(),
      processingTime: Date.now()
    };
    
    console.log('✅ Successfully solved problem');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error in math solver:', error);
    
    // Enhanced fallback with better error handling
    try {
      console.log('🔄 Attempting fallback solution...');
      const fallbackPrompt = `Solve this math problem clearly and concisely: ${req.body.problem}
      
      Provide the solution in a clear format with:
      1. The final answer
      2. Brief explanation of how you got there
      
      Problem: ${req.body.problem}`;
      
      const fallbackResult = await model.generateContent(fallbackPrompt);
      const fallbackResponse = fallbackResult.response.text();
      
      res.json({
        success: true,
        originalProblem: req.body.problem,
        analysis: { 
          operation: 'general_solution', 
          expression: req.body.problem, 
          context: 'Fallback solution method used' 
        },
        calculation: { 
          method: 'gemini-fallback', 
          result: fallbackResponse, 
          operation: 'solve',
          steps: 'Solution provided directly by AI'
        },
        explanation: 'Used simplified solution method due to parsing complexity.',
        timestamp: new Date().toISOString(),
        note: 'Fallback method used - solution may be less structured'
      });
      
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError);
      res.status(500).json({ 
        success: false,
        error: 'Failed to solve math problem',
        details: error.message,
        troubleshooting: {
          checkApiKey: 'Ensure GEMINI_API_KEY is properly configured',
          checkProblem: 'Verify the math problem is clearly stated',
          supportedOperations: ['derivatives', 'integrals', 'factoring', 'simplification', 'solving equations']
        }
      });
    }
  }
});

// Enhanced health check with detailed diagnostics
app.get('/health', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      gemini: !!process.env.GEMINI_API_KEY ? 'configured' : 'missing_api_key',
      geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      cors: 'enabled',
      method: 'gemini-ai-only'
    },
    configuration: {
      port: process.env.PORT || 3000,
      nodeEnv: process.env.NODE_ENV || 'development',
      corsAllowAll: process.env.CORS_ALLOW_ALL === 'true',
      allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 'default',
      frontendUrl: process.env.FRONTEND_URL || 'not_set'
    },
    server: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    }
  };
  
  console.log('🏥 Health check requested:', healthData);
  res.json(healthData);
});

// Operations listing endpoint
app.get('/operations', (req, res) => {
  res.json({
    availableOperations: [
      'derivative', 'integral', 'simplify', 'factor', 
      'solve', 'find_zeros', 'expand', 'evaluate'
    ],
    method: 'gemini-ai-enhanced',
    description: "Mathematical operations supported by the Gemini-powered solver",
    examples: [
      "Find the derivative of x^2 + 3x + 2",
      "Integrate 2x + 3",
      "Factor x^2 + 5x + 6",
      "Simplify (x + 1)^2",
      "Solve x^2 - 4 = 0"
    ]
  });
});

// Examples endpoint for testing
app.get('/examples', (req, res) => {
  res.json({
    examples: [
      {
        problem: "Find the derivative of x^2 + 3x + 2",
        expectedOperation: "derivative",
        expectedResult: "2x + 3",
        difficulty: "basic"
      },
      {
        problem: "Integrate 2x + 3 dx",
        expectedOperation: "integral",
        expectedResult: "x^2 + 3x + C",
        difficulty: "basic"
      },
      {
        problem: "Factor x^2 + 5x + 6",
        expectedOperation: "factor",
        expectedResult: "(x + 2)(x + 3)",
        difficulty: "intermediate"
      },
      {
        problem: "Simplify (x^2 + 2x + 1)",
        expectedOperation: "simplify",
        expectedResult: "(x + 1)^2",
        difficulty: "basic"
      },
      {
        problem: "Find the zeros of x^2 - 4",
        expectedOperation: "find_zeros",
        expectedResult: "x = 2, x = -2",
        difficulty: "basic"
      }
    ],
    usage: "POST to /solve with { problem: 'your math problem here' }"
  });
});

// Root endpoint with API documentation
app.get('/', (req, res) => {
  res.json({
    name: "Hybrid Math Solver API",
    version: "2.0.0",
    description: "AI-powered mathematical problem solver using Google Gemini",
    endpoints: {
      "POST /solve": "Solve a mathematical problem",
      "GET /health": "Check server health and configuration", 
      "GET /operations": "List supported mathematical operations",
      "GET /examples": "Get example problems and expected results"
    },
    usage: {
      solve: {
        method: "POST",
        url: "/solve",
        body: { problem: "Find the derivative of x^2 + 3x" },
        response: "Structured solution with steps and explanation"
      }
    },
    cors: "Enabled for Vercel frontend",
    ai_model: "Google Gemini 1.5 Flash"
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Fixed 404 handler - removed the problematic '*' wildcard
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: ['/solve', '/health', '/operations', '/examples'],
    requestedPath: req.originalUrl
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
🚀 Hybrid Math Solver API is running!
📡 Host: ${HOST}
📡 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🤖 AI Model: ${GEMINI_MODEL}
🔑 API Key: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}
🛡️  CORS: ${process.env.CORS_ALLOW_ALL === 'true' ? 'Allow All' : 'Restricted'}
🌍 Allowed Origins: ${process.env.ALLOWED_ORIGINS || 'Default (localhost)'}
🎯 Frontend URL: ${process.env.FRONTEND_URL || 'Not specified'}
📊 Health Check: GET /health
🧮 Solve Math: POST /solve

Environment Variables:
- GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'Set ✅' : 'Missing ❌'}
- GEMINI_MODEL: ${GEMINI_MODEL}
- ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS || 'Not set (using defaults)'}
- CORS_ALLOW_ALL: ${process.env.CORS_ALLOW_ALL || 'false'}
- FRONTEND_URL: ${process.env.FRONTEND_URL || 'Not set'}
- NODE_ENV: ${process.env.NODE_ENV || 'development'}

Ready to solve mathematical problems! 🎯
  `);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
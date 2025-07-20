import { ref, computed } from 'vue';
import type { PromptTemplate } from '~/stores/prompt-engineering';

export const usePromptTemplates = () => {
  // Template patterns for common prompt engineering tasks
  const templatePatterns = {
    chainOfThought: {
      template: `<thinking>
Let me break this down step by step:
1. First, I'll analyze {{task}}
2. Then, I'll consider {{constraints}}
3. Finally, I'll implement {{solution}}
</thinking>

<answer>
{{implementation}}
</answer>`,
      description: "Step-by-step reasoning for complex tasks",
      variables: ['task', 'constraints', 'solution', 'implementation']
    },
    
    multiShot: {
      template: `<examples>
<example>
Input: {{example1_input}}
Output: {{example1_output}}
</example>
<example>
Input: {{example2_input}}
Output: {{example2_output}}
</example>
</examples>

Now for your task: {{user_task}}`,
      description: "Learn from examples",
      variables: ['example1_input', 'example1_output', 'example2_input', 'example2_output', 'user_task']
    },
    
    xmlStructured: {
      template: `<task>
<objective>{{objective}}</objective>
<constraints>
{{#each constraints}}
  <constraint>{{this}}</constraint>
{{/each}}
</constraints>
<requirements>
  <must-have>{{mustHave}}</must-have>
  <nice-to-have>{{niceToHave}}</nice-to-have>
</requirements>
</task>`,
      description: "Structured task definition",
      variables: ['objective', 'constraints', 'mustHave', 'niceToHave']
    },
    
    errorPrevention: {
      template: `<instructions>
{{main_instructions}}

If you are unsure about any aspect, write "I don't know" or ask for clarification.
</instructions>

<validation>
Ensure your solution:
- Works correctly for all valid inputs, not just test cases
- Does not hard-code values
- Handles edge cases appropriately
</validation>`,
      description: "Reduce hallucinations and improve accuracy",
      variables: ['main_instructions']
    },
    
    rolePrompt: {
      template: `You are {{role}} with expertise in {{expertise}}.

Your approach should be:
{{approach}}

Key principles to follow:
{{principles}}`,
      description: "Define Claude's role and expertise",
      variables: ['role', 'expertise', 'approach', 'principles']
    }
  };

  // Best practices for different task types
  const bestPractices = {
    coding: [
      'Provide clear context about the codebase',
      'Include relevant file paths and dependencies',
      'Specify coding standards and conventions',
      'Request error handling and edge cases',
      'Ask for tests when appropriate'
    ],
    research: [
      'Define the scope clearly',
      'Specify desired output format',
      'Request sources and citations',
      'Set depth and breadth parameters',
      'Include evaluation criteria'
    ],
    analysis: [
      'Provide all relevant data',
      'Specify analysis methodology',
      'Request both findings and recommendations',
      'Ask for confidence levels',
      'Include visualization requirements'
    ],
    refactoring: [
      'Include current code structure',
      'Specify refactoring goals',
      'Maintain backward compatibility requirements',
      'Request before/after comparisons',
      'Include performance considerations'
    ],
    debugging: [
      'Provide error messages and stack traces',
      'Include relevant code context',
      'Specify reproduction steps',
      'Request root cause analysis',
      'Ask for fix verification steps'
    ]
  };

  // Constraint templates
  const constraintTemplates = {
    quality: [
      'Follow SOLID principles',
      'Ensure code is testable',
      'Maintain clean code practices',
      'Add appropriate error handling',
      'Include comprehensive documentation'
    ],
    performance: [
      'Optimize for speed',
      'Minimize memory usage',
      'Consider scalability',
      'Avoid N+1 queries',
      'Use efficient algorithms'
    ],
    security: [
      'Validate all inputs',
      'Use parameterized queries',
      'Implement proper authentication',
      'Follow least privilege principle',
      'Sanitize outputs'
    ],
    compatibility: [
      'Maintain backward compatibility',
      'Support specified browsers/platforms',
      'Follow semantic versioning',
      'Preserve public APIs',
      'Handle legacy data formats'
    ]
  };

  // Output format templates
  const outputFormats = {
    markdown: `Format your response in markdown with:
- Clear headings
- Code blocks with syntax highlighting
- Bullet points for lists
- Tables where appropriate`,
    
    json: `Return your response as valid JSON with the following structure:
{
  "summary": "Brief overview",
  "details": {},
  "recommendations": [],
  "confidence": 0.0-1.0
}`,
    
    structured: `Organize your response with:
1. Executive Summary
2. Detailed Analysis
3. Recommendations
4. Next Steps
5. Appendices (if needed)`,
    
    code: `Provide:
- Complete, runnable code
- Inline comments for complex logic
- Usage examples
- Import statements
- Error handling`
  };

  // Helper functions
  function interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    
    // Simple variable replacement
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });
    
    // Handle each loops (simplified)
    result = result.replace(/{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g, (match, varName, content) => {
      const items = variables[varName];
      if (Array.isArray(items)) {
        return items.map(item => content.replace(/{{this}}/g, item)).join('');
      }
      return '';
    });
    
    return result;
  }

  function generatePromptFromTemplate(
    pattern: keyof typeof templatePatterns,
    variables: Record<string, any>
  ): string {
    const template = templatePatterns[pattern];
    return interpolateTemplate(template.template, variables);
  }

  function suggestConstraints(taskType: string): string[] {
    const suggestions: string[] = [];
    
    // Add relevant constraints based on task type
    if (taskType.includes('code') || taskType.includes('implement')) {
      suggestions.push(...constraintTemplates.quality.slice(0, 3));
    }
    
    if (taskType.includes('optimize') || taskType.includes('performance')) {
      suggestions.push(...constraintTemplates.performance.slice(0, 2));
    }
    
    if (taskType.includes('secure') || taskType.includes('auth')) {
      suggestions.push(...constraintTemplates.security.slice(0, 3));
    }
    
    return suggestions;
  }

  function estimateComplexity(prompt: Partial<PromptTemplate>): 'simple' | 'moderate' | 'complex' {
    const sectionCount = prompt.structure?.sections?.length || 0;
    const resourceCount = prompt.structure?.resources?.length || 0;
    const subagentCount = prompt.structure?.subagents?.length || 0;
    
    const score = sectionCount * 10 + resourceCount * 5 + subagentCount * 20;
    
    if (score > 100) return 'complex';
    if (score > 50) return 'moderate';
    return 'simple';
  }

  return {
    templatePatterns,
    bestPractices,
    constraintTemplates,
    outputFormats,
    interpolateTemplate,
    generatePromptFromTemplate,
    suggestConstraints,
    estimateComplexity
  };
};
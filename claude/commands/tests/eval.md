# Create Test for Chat Assistant Evaluation

## ARGS

QUERY - $ARGUMENTS
`
Follow these steps to create a self-improving test:

## Step 1: Parse Query
Store QUERY as your test input.

## Step 2: Generate Initial Test
Create test description and expected output for what you're evaluating about the assistant's response.

## Step 3: Run Test & Capture Output
Invoke the test with initial simple criteria. The test will return detailed evaluation steps.

## Step 4: Evolve & Rerun
Replace the initial criteria with the detailed evaluation steps from Step 3. Run the test again using only the step-based evaluation framework.

Actually run the test at each step and use the real output to update the next step. Don't simulate - execute and iterate based on actual results.

Follow the same structure as previous tests. No comments. Clean up for the final result.

## IMPORTANT: Additional details 

EvalationType must be CRITERIA initially. Leave expectedOutput blank then after the first run use the actual output. Use the evaluation steps that are generated and switch EvaluationType to STEPS.
If the evaluation steps do not include the expected output then do not include the expected output at all. 

In the end, I want you to judge the evaluation steps and ensure they will be useful in judging the accuracy of the test.


Before starting ask me for the user query, if QUERY is blank, I would like to write an evaluation test for.`

type ClarifaiAuth = {
  token: string;
};

export async function main(auth: ClarifaiAuth, modelId: string, prompt: string) {
  const headers = {
    Authorization: `Key ${auth.token}`,
    'Content-Type': 'application/json',
  };

  console.log(auth);
  console.log(modelId);
  console.log(prompt);


  try {
    // Find the model
    const findModelResponse = await fetch(`https://api.clarifai.com/v2/models?name=${modelId}&use_cases=llm`, {
      method: 'GET',
      headers: headers,
    });

    if (!findModelResponse.ok) {
      throw new Error(`Couldn't find model ${modelId}: ${findModelResponse.statusText}`);
    }

    const findModelData = await findModelResponse.json();
    const model = findModelData.models[0];

    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Send the prompt to the model
    const sendPromptResponse = await fetch(`https://api.clarifai.com/v2/users/${model.model_version.user_id}/apps/${model.model_version.app_id}/models/${model.id}/versions/${model.model_version.id}/outputs`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        inputs: [
          {
            data: {
              text: {
                raw: prompt,
              },
            },
          },
        ],
      }),
    });

    if (!sendPromptResponse.ok) {
      throw new Error(`Couldn't send prompt to model ${modelId}: ${sendPromptResponse.statusText}`);
    }

    const sendPromptData = await sendPromptResponse.json();
    return { result: sendPromptData.outputs[0].data.text.raw };
  } catch (error) {
    return { error: error };
  }
}


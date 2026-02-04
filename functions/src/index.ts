/**
 * Importamos los módulos de Firebase (V1)
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Importamos los módulos de Gemini
 */
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  // Importamos el tipo de la respuesta ---
  GenerateContentResponse,
} from "@google/generative-ai";

// Inicializa Firebase Admin
admin.initializeApp();

// Configuración de Gemin ---
const API_KEY = functions.config().gemini.key;
if (!API_KEY) {
  console.error(
    "Error: La clave de API de Gemini (gemini.key) no está configurada."
  );
}

// MODELO DE UNA SOLA LLAMADA 
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-image-preview",
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE, // ¡Permitir todo!
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ],
});

/**
 * Parsea el texto de la IA para encontrar un JSON válido.
 */
function parseSuggestionJson(
  rawText: string,
  uid: string
): { suggestionText: string } {
  const jsonStartIndex = rawText.indexOf("{");
  const jsonEndIndex = rawText.lastIndexOf("}");

  if (jsonStartIndex === -1 || jsonEndIndex === -1) {
    functions.logger.error(
      `[${uid}] Error de Parseo: El texto no contiene '{' o '}'.`,
      rawText
    );
    throw new Error("El texto no contiene un objeto JSON válido.");
  }

  let jsonString = rawText.substring(jsonStartIndex, jsonEndIndex + 1);
  jsonString = jsonString.trim();

  const jsonResponse = JSON.parse(jsonString);
  const suggestionText = jsonResponse.sugerencia_corte;

  if (!suggestionText) {
    throw new Error("El JSON de la IA no contiene 'sugerencia_corte'.");
  }

  functions.logger.log(`[${uid}] Análisis de IA:`, jsonResponse.analisis);
  return { suggestionText };
}

/**
 * Define la Cloud Function "onCall"
 */
export const analyzeFace = functions.https.onCall(
  async (data: any, context: functions.https.CallableContext) => {
    // 1. Validar la autenticación
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "La función debe ser llamada por un usuario autenticado."
      );
    }
    const uid = context.auth.uid;

    // 2. Obtener la imagen Base64
    const imageBase64 = data.image;
    if (!imageBase64) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "No se proporcionó ninguna imagen."
      );
    }

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/jpeg",
      },
    };

    // PROMPT DE UNA SOLA LLAMADA 
  const promptText = `
Eres "BarberIA", un consultor de imagen y estilista de clase mundial con especialización en visagismo. Tu objetivo es encontrar el corte de cabello ideal que maximice la estética del usuario, sin importar su género o el estado actual de su cabello.

Tu tarea es analizar la imagen proporcionada y generar dos salidas:
1. Un objeto JSON con el análisis técnico y la recomendación.
2. Una imagen editada (in-painting) visualizando esa recomendación.

---
### TAREA 1: ANÁLISIS Y ESTRATEGIA (Lógica del Experto)

Analiza la imagen buscando:
* **Forma del Rostro:** (Ovalada, Cuadrada, Redonda, Diamante, Corazón, Alargada).
* **Características del Cabello:** (Lacio, Ondulado, Rizado, Afro / Densidad Alta, Media, Baja / Entradas o Coronilla despoblada).
* **Género Aparente:** (Masculino/Femenino) para ajustar la terminología del corte.

**REGLAS DE ORO PARA LA SUGERENCIA:**
1.  **Visagismo Puro:** Tu prioridad es la armonía visual. Si el usuario tiene el pelo corto pero le quedaría mejor largo (o viceversa), SUGIERE EL CAMBIO. No te limites al largo actual.
2.  **Manejo de Pelo Escaso/Calvicie:** Si detectas baja densidad o alopecia, NUNCA uses lenguaje negativo. Sé propositivo.
    * *Mala sugerencia:* "Estás calvo, rápate."
    * *Buena sugerencia:* "Para armonizar la densidad capilar, sugiero un estilo muy corto o rapado texturizado que limpie los laterales y aporte equilibrio visual."
    * Si hay poco pelo arriba, sugiere cortes que den volumen visual o un rapado limpio si es avanzado.
3.  **Diversidad:** Adapta los nombres de los cortes según el género.

Responde ÚNICAMENTE con este objeto JSON válido (sin bloques de código \`\`\`json):

{
  "analisis": {
    "genero": "Hombre/Mujer",
    "forma_rostro": "Ej. Diamante",
    "tipo_cabello": "Ej. Ondulado / Densidad Media",
    "largo_actual": "Ej. Cabello largo descuidado / Entradas visibles"
  },
  "sugerencia_corte": "Aquí va tu sugerencia de máximo 40 palabras, basada en la lógica anterior.",
 
}

---
### TAREA 2: GENERACIÓN DE IMAGEN (EDICIÓN)

* Actúa como un editor de fotos experto.
* Reemplaza el cabello original con el estilo definido en \`sugerencia_corte\`.
* **CRUCIAL:** La integración debe ser FOTORREALISTA. La iluminación del cabello nuevo debe coincidir con la de la cara.
* **RESPETO DE IDENTIDAD:** NO cambies los ojos, nariz, boca, piel o ropa. Solo el cabello.
* Si sugieres un corte más largo que el original, genera el cabello de forma natural sobre los hombros si aplica.
`;

    let suggestionText: string; 
    let rawText: string | undefined;
    let simulatedImageBase64: string | undefined;
    let response: GenerateContentResponse;

    try {
      functions.logger.log(`[${uid}] Iniciando análisis de IA (1 llamada)...`);
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [imagePart, { text: promptText }] }],
      });

      response = result.response;

      rawText = response.candidates?.[0].content.parts
        .find((part: any) => part.text)
        ?.text
        ?.trim();

      simulatedImageBase64 = response.candidates?.[0].content.parts
        .find((part: any) => part.inlineData)
        ?.inlineData
        ?.data;
    } catch (error: unknown) {
      functions.logger.error(
        `[${uid}] Error al llamar a la API de Gemini`,
        error
      );
      if (error instanceof Error && error.message.includes("SAFETY")) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "La imagen fue bloqueada por razones de seguridad."
        );
      }
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error al generar la simulación.";
      throw new functions.https.HttpsError("internal", errorMessage);
    }

    // Bloque de Parseo de Texto 
    if (!rawText) {
      functions.logger.error(
        `[${uid}] Error: La IA no devolvió texto.`,
        response.promptFeedback || "Sin feedback de prompt."
      );
      throw new functions.https.HttpsError(
        "internal",
        "La IA no pudo procesar la solicitud (sin texto)."
      );
    }

    try {
      // Asignamos el valor a 'suggestionText'
      const parsedJson = parseSuggestionJson(rawText, uid);
      suggestionText = parsedJson.suggestionText;
    } catch (error: unknown) {
      functions.logger.error(`[${uid}] Error en el Parseo de JSON:`, error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error al parsear la respuesta de la IA.";
      throw new functions.https.HttpsError("internal", errorMessage);
    }

    if (!simulatedImageBase64) {
      functions.logger.error(
        `[${uid}] Error: La IA no devolvió imagen.`,
        response.promptFeedback || "Sin feedback de prompt."
      );
      throw new functions.https.HttpsError(
        "internal",
        "La IA no pudo procesar la solicitud (sin imagen)."
      );
    }

    functions.logger.log(`[${uid}] Análisis (1 llamada) completado.`);
    return {
      suggestionText: suggestionText,
      simulatedImageBase64: simulatedImageBase64,
    };
  }
);
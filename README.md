# ⚙️ BarberIA Backend

Este repositorio contiene la lógica **Serverless** que impulsa a **BarberIA**. A través de una Cloud Function especializada, el sistema actúa como un experto en visagismo para procesar imágenes de usuarios y generar recomendaciones estéticas de clase mundial.

---

## 🚀 La Función Principal: `analyzeFace`

El backend se centra en un endpoint único que realiza las siguientes tareas críticas:

1. **Autenticación:** Valida que las peticiones provengan exclusivamente de usuarios registrados en Firebase Auth.
2. **Procesamiento de Imagen:** Recibe flujos de datos en Base64 desde la app móvil y los prepara para el modelo de visión.
3. **Inferencia de IA (Gemini):** Utiliza el modelo `gemini-2.5-flash-image-preview` para realizar un análisis de:
    * Forma del rostro (Ovalada, Cuadrada, etc.).
    * Densidad y tipo de cabello.
    * Sugerencia de corte personalizada basada en armonía visual.
4. **Validación de Respuesta:** Implementa lógica de parseo para asegurar que la salida de la IA cumpla con el esquema JSON requerido por el frontend.

---

## 🛠️ Stack Tecnológico

* **Lenguaje:** TypeScript.
* **Plataforma:** Firebase Cloud Functions (V1).
* **IA:** Google Generative AI (Gemini API).
* **Entorno de Ejecución:** Node.js.


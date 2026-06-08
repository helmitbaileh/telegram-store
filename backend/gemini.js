require('dotenv').config();
const { GoogleGenAI, Type, Schema } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function parseOrder(messageText, imageParts = []) {
  const prompt = `
أنت مساعد ذكي ومحلل دقيق لاستخراج بيانات طلبات الألعاب والاشتراكات من الرسائل.
قم بتحليل النص والصور (إن وجدت) بدقة لاستخراج اسم المنتج (الاشتراك، المنصة، اللعبة، أو الرصيد) والمدة (أو الكمية).
قم بترجمة النتيجة إلى اللغة العربية بشكل واضح ومرتب.

قواعد صارمة جداً:
1. إذا لم تجد طلب شراء أو اشتراك واضح (مثلاً الرسالة مجرد سؤال، أو كلام عام، أو صورة لا علاقة لها بالمنتجات)، قم بتعيين الحقل "isOrder" إلى false.
2. إذا كان هناك رابط أو نص ولم تستطع معرفة اسم اللعبة منه، **لا تخمن أبداً ولا تؤلف اسماً من عندك**. اترك اسم المنتج فارغاً إذا كنت غير متأكد.
3. **الاستنتاج الذكي للمصطلحات:** لا تقتصر على معاني حرفية أو قائمة ثابتة، بل استخدم ذكائك ومعرفتك الواسعة في عالم الألعاب والاشتراكات لفهم الاختصارات من السياق العام. (مثلاً إذا رأيت كلمة "اكسترا" أو "اسينشيال" أو "ديلوكس" لوحدها، فاستنتج تلقائياً أنها تعني "بلايستيشن بلس"، وإذا رأيت "بي سي" أو "التميت" فاستنتج أنها "اكس بوكس قيم باس"). قم بتطبيق هذا الاستنتاج الذكي والمرن على كافة المنتجات والألعاب والخدمات لكتابة الاسم الكامل والواضح للمنتج دائماً.
4. قم باستخراج كل الطلبات المستقلة في مصفوفة "orders". 
5. **تضمين الكمية في اسم المنتج:** ضع الكمية كرقم في حقل "quantity" كما هي، ولكن **أيضاً يجب إلزامياً** أن تذكر هذه الكمية مع وصفها (مثل كلمة حساب، اشتراك، الخ) في بداية حقل "productName" (مثال: إذا كانت الكمية 20 ونوع المنتج اكسبوكس، اجعل اسم المنتج '20 حساب اكسبوكس').
6. **فهم السياق المترابط:** إذا كانت هناك عدة أسطر، وذكر الزبون اسم المنتج في سطر وفي سطر آخر ذكر مدة فقط، يجب أن تستنتج من السياق أن السطر الثاني يقصد نفس المنتج السابق.
7. **الكميات والرسائل المنفصلة:** سترى النص مقسماً إلى [الرسالة 1]، [الرسالة 2] إلخ. 
   - إذا طلب الزبون كمية محددة في **نفس الرسالة** (مثلاً "اريد 5 اكسبوكس 10 اشهر")، لا تقم بفصلها إلى 5 طلبات، بل اجعلها طلب واحد واكتب 5 في حقل "quantity".
   - أما إذا تكرر نفس المنتج في **رسائل منفصلة**، فيجب عليك **فصلها** إلى طلبين مستقلين في مصفوفة orders.
8. **اقتباس الرسالة:** يجب أن تستخرج وتنسخ "الرسالة الدقيقة" (أو السطر) الذي تسبب في إنشاء هذا الطلب من النص المجمع وتضعه في حقل "messageContext".

الرسالة المجمعة:
"${messageText || 'بدون نص، افحص الصور المرفقة إن وجدت'}"
`;

  const parts = [{ text: prompt }];
  if (imageParts && imageParts.length > 0) {
    for (const img of imageParts) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data
        }
      });
    }
  }

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await ai.models.generateContent({
        model: retries === 1 ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
        contents: parts,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isOrder: {
                type: Type.BOOLEAN,
                description: "هل هذه الرسالة تحتوي على طلب منتجات حقيقي؟ إذا كانت مجرد سلام أو كلام غير متعلق بمنتج اجعلها false"
              },
              orders: {
                type: Type.ARRAY,
                description: "قائمة الطلبات المستخرجة من الرسالة",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productName: {
                      type: Type.STRING,
                      description: "اسم المنتج بالعربية، مسبوقاً بالكمية ووصفها إذا وجدت (مثلا '20 حساب اكسبوكس جيم باس هندي')"
                    },
                    duration: {
                      type: Type.STRING,
                      description: "مدة الاشتراك بالعربية، مثلا '١٠ شهور'"
                    },
                    quantity: {
                      type: Type.INTEGER,
                      description: "الكمية المطلوبة (أرقام فقط)، الافتراضي هو 1"
                    },
                    messageContext: {
                      type: Type.STRING,
                      description: "النص الدقيق المقتبس من الرسالة المجمعة والذي يدل على هذا الطلب"
                    }
                  },
                  required: ["productName", "duration", "messageContext"]
                }
              }
            },
            required: ["isOrder", "orders"]
          }
        }
      });
      
      const text = response.text;
      return JSON.parse(text);
    } catch (error) {
      console.error(`Gemini API Error (retries left: ${retries - 1}):`, error.message);
      retries--;
      if (retries === 0) return null;
      // Wait 2 seconds before retrying
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

async function editOrderWithAI(oldOrder, managerPrompt) {
  const prompt = `
لديك الطلب التالي:
المنتج: ${oldOrder.productName}
المدة: ${oldOrder.duration}

المستخدم يطلب التعديل التالي: "${managerPrompt}"

قم بتطبيق التعديل وإرجاع البيانات المحدثة بصيغة JSON. يجب أن تكون الحقول باللغة العربية.
`;

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await ai.models.generateContent({
        model: retries === 1 ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productName: {
                type: Type.STRING,
              },
              duration: {
                type: Type.STRING,
              }
            },
            required: ["productName", "duration"]
          }
        }
      });
      
      return JSON.parse(response.text);
    } catch (error) {
      console.error(`Gemini API Error in edit (retries left: ${retries - 1}):`, error.message);
      retries--;
      if (retries === 0) return null;
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

async function analyzeProductDemand(ordersList) {
  const prompt = `
أنت محلل بيانات ومختص في السوق الرقمي.
لديك قائمة بالطلبات التي تمت في المتجر مؤخراً:
${JSON.stringify(ordersList, null, 2)}

يرجى تحليل هذه الطلبات وتجميع المنتجات المتشابهة لاستخراج "قائمة المنتجات" ومستوى الطلب على كل منتج.
قم بتوحيد أسماء المنتجات المتشابهة (مثلا "اكس بوكس التميت 10 شهور" و "2 حساب اكسبوكس" كلها تعتبر تحت صنف "اكس بوكس").

المطلوب إرجاع مصفوفة من المنتجات بصيغة JSON.
`;

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            description: "قائمة المنتجات وتحليل الطلب",
            items: {
              type: Type.OBJECT,
              properties: {
                productName: { type: Type.STRING, description: "اسم المنتج أو الصنف الموحد" },
                demandLevel: { type: Type.STRING, description: "عالي، متوسط، أو منخفض" },
                orderCount: { type: Type.INTEGER, description: "عدد الطلبات التقريبي" },
                trend: { type: Type.STRING, description: "صاعد، مستقر، متراجع" },
                notes: { type: Type.STRING, description: "ملاحظة عن تفضيلات الزبائن" }
              },
              required: ["productName", "demandLevel", "orderCount", "trend", "notes"]
            }
          }
        }
      });
      return JSON.parse(response.text);
    } catch (error) {
      console.error('Gemini API Error in analyzeProductDemand:', error.message);
      retries--;
      if (retries === 0) return [];
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

module.exports = { parseOrder, editOrderWithAI, analyzeProductDemand };

const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
const app = express();

app.use(express.json());

// Armazenamento de dados na memória
const dataStore = [];

// Rota para enviar dados
app.post('/submit', (req, res) => {
    const data = req.body;
    dataStore.push(data);
    res.status(200).json({ status: 'success' });
});

// Rota para obter dados
app.get('/data', (req, res) => {
    res.status(200).json(dataStore);
});

// Função para gerar respostas do GPT-3.5-turbo
async function generateResponse(messages) {
    const api_url = 'https://api.openai.com/v1/chat/completions';
    const api_key = 'YOUR API KEY';

    const response = await axios.post(api_url, {
        model: 'gpt-3.5-turbo',
        messages: messages
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api_key}`
        }
    });

    const result = response.data;
    return result.choices[0].message.content;
}

async function scrapeAndProcess() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    let startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() + 23); // Ajusta a data para o próximo dia
    const maxAttempts = 30;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const formattedFutureDate = startDate.toISOString().split('T')[0];
        const url = `https://theathletic.com/football/premier-league/schedule/${formattedFutureDate}/`;

        console.log(`Tentativa ${attempt + 1}: Buscando URL ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Espera 5 segundos para carregar o conteúdo dinâmico
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Faz captura de tela para debug
        await page.screenshot({ path: `debug-screenshot-${attempt + 1}.png` });

        // Loga o número de frames
        const frames = await page.frames();
        console.log('Número de frames:', frames.length);

        const scrapedTeams = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div.sc-a5f374a-0.ePURgB'));
            console.log('Elementos encontrados:', elements.length);
            elements.forEach((el, index) => {
                console.log(`Conteúdo do elemento ${index + 1}:`, el.textContent.trim());
            });
            // Pula o primeiro elemento e pega o segundo, depois pula o próximo e pega o seguinte, e assim por diante
            return elements.filter((el, index) => index % 2 !== 0).map(el => el.textContent.trim());
        });

        console.log('Times raspados:', scrapedTeams);

        // Loga o HTML completo da página se nenhum time for encontrado
        if (scrapedTeams.length === 0) {
            console.log(`Nenhum dado encontrado para ${formattedFutureDate}. Tentando o próximo dia...`);
            startDate.setUTCDate(startDate.getUTCDate() + 1);
            continue;
        }

        for (let i = 0; i < scrapedTeams.length; i += 2) {
            const team1 = scrapedTeams[i];
            const team2 = scrapedTeams[i + 1];
            const mensagemChatGPT = `Which one has the best chance of winning? ${team1} or ${team2}, just answer me with the team name, nothing else!`;

            const responseFromGPT = await generateResponse([
                { role: 'system', content: 'You are a helpful assistant. and you have to summarize the text provided by the user.' },
                { role: 'user', content: mensagemChatGPT }
            ]);

            console.log('Resposta do ChatGPT:', responseFromGPT);

            let chanceTime1, chanceTime2, chanceEmpate;
            if (responseFromGPT.trim().toLowerCase() === team1.toLowerCase()) {
                chanceTime1 = 60;
                chanceTime2 = 30;
                chanceEmpate = 10;
            } else if (responseFromGPT.trim().toLowerCase() === team2.toLowerCase()) {
                chanceTime1 = 30;
                chanceTime2 = 60;
                chanceEmpate = 10;
            } else {
                chanceTime1 = 45;
                chanceTime2 = 45;
                chanceEmpate = 10;
            }

            const resultado = Math.floor(Math.random() * 100) + 1;
            let vencedor;
            if (resultado <= chanceEmpate) {
                vencedor = 'Empate';
            } else if (resultado <= (chanceEmpate + chanceTime1)) {
                vencedor = team1;
            } else {
                vencedor = team2;
            }

            const mensagemChatGPT1 = `Provide a brief summary of why ${vencedor} would win a game against ${team2}, and why betting on them is advisable. Response in English.`;
            const responseFromGPT1 = await generateResponse([
                { role: 'system', content: 'You are a helpful assistant. and you have to summarize the text provided by the user.' },
                { role: 'user', content: mensagemChatGPT1 }
            ]);

            const mensagem = {
                game: `${team1} vs ${team2}`,
                date: formattedFutureDate,
                winning_bet: vencedor,
                analysis: responseFromGPT1
            };

            // Envia dados para a API Node.js
            try {
                const response = await axios.post('http://localhost:3000/submit', mensagem);
                if (response.status === 200) {
                    console.log('Dados enviados com sucesso');
                } else {
                    console.log('Falha ao enviar dados');
                }
            } catch (error) {
                console.error('Erro ao enviar dados:', error.message);
            }

            // Adiciona um atraso entre as requisições para evitar limite de taxa
            await new Promise(resolve => setTimeout(resolve, 20000)); // Atraso de 20 segundos
        }

        // Se dados foram encontrados, interrompe o loop
        if (scrapedTeams.length > 0) {
            break;
        }
    }

    await browser.close();
}

// Inicia o servidor
app.listen(3000, () => {
    console.log('Servidor está rodando em http://localhost:3000');
});

// Executa a função de raspagem e processamento
scrapeAndProcess();

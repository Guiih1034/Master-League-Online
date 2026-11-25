# ⚽ Master League Online

<p align="center">
  <strong>Gerencie sua liga. Organize suas equipes. Construa sua história.</strong>
</p>

<p align="center">
  <a href="https://master-league-online.vercel.app/">Acessar aplicação</a> •
  <a href="https://github.com/Guiih1034/Master-League-Online">Repositório GitHub</a>
</p>

---

## 📌 Sobre o projeto

O **Master League Online (MLO)** é uma plataforma desenvolvida para gerenciamento de ligas e campeonatos online de EA SPORTS FC.

O projeto tem como objetivo oferecer uma experiência completa para organizadores e participantes, centralizando em um único ambiente a administração de competições, equipes, jogadores, partidas e classificações.

A proposta é automatizar ao máximo o gerenciamento das ligas, reduzindo tarefas manuais e proporcionando uma experiência organizada, intuitiva e acessível.

## 🎯 Objetivos

- Facilitar a criação e administração de ligas online.
- Automatizar a organização de campeonatos e rodadas.
- Centralizar informações de equipes e participantes.
- Acompanhar resultados e classificações.
- Oferecer uma experiência moderna e responsiva.
- Permitir o acesso por diferentes dispositivos.

## ✨ Funcionalidades

O Master League Online tem como foco os seguintes recursos:

### 🏆 Gerenciamento de competições
- Organização de ligas e campeonatos.
- Configuração dos formatos de competição.
- Gerenciamento de temporadas.
- Organização automática de confrontos e rodadas.

### ⚽ Gerenciamento de equipes
- Cadastro e administração de equipes.
- Associação de participantes às equipes.
- Gerenciamento de elencos.
- Consulta de informações dos times.

### 📅 Rodadas e partidas
- Geração de calendário de jogos.
- Organização dos confrontos.
- Registro e acompanhamento de resultados.
- Controle do andamento das partidas.

### 📊 Classificação e estatísticas
- Tabela de classificação.
- Pontuação das equipes.
- Acompanhamento do desempenho.
- Estatísticas das competições.

### 👤 Participantes
- Contas individuais.
- Gerenciamento de participantes.
- Acesso às informações das competições.

*Observação: a disponibilidade de cada funcionalidade depende da implementação e da versão atual da aplicação.*

## 🖥️ Aplicação

**Acesse a versão publicada:**

https://master-league-online.vercel.app/

A plataforma foi desenvolvida com foco em uma interface responsiva, permitindo sua utilização em computadores, tablets e smartphones.

## 🛠️ Tecnologias utilizadas

| Tecnologia | Utilização |
|---|---|
| Node.js | Ambiente de execução |
| Express 5 | Backend e API |
| JavaScript | Desenvolvimento da aplicação |
| PostgreSQL / camada de dados | Persistência e integração de dados |
| Capacitor 7 | Integração com dispositivos móveis |
| Vercel | Hospedagem e publicação |
| Nodemailer | Envio de e-mails |

## 📂 Estrutura do projeto

```text
Master-League-Online/
│
├── api/                 # Endpoints e integração da API
├── data/                # Dados auxiliares
├── public/              # Interface e arquivos públicos
├── scripts/             # Scripts de manutenção e validação
├── server/              # Backend e regras de negócio
│
├── .env.example         # Exemplo de configuração
├── Dockerfile           # Configuração Docker
├── capacitor.config.json
├── package.json         # Dependências e scripts
├── vercel.json          # Configuração Vercel
├── render.yaml          # Configuração Render
└── README.md            # Documentação
```

## ⚙️ Instalação e execução local

### Pré-requisitos

- Node.js 22 ou superior.
- npm.
- Git.

### 1. Clonar o repositório

```bash
git clone https://github.com/Guiih1034/Master-League-Online.git
```

### 2. Entrar na pasta

```bash
cd Master-League-Online
```

### 3. Instalar dependências

```bash
npm install
```

### 4. Configurar variáveis de ambiente

Crie seu arquivo `.env` com base no `.env.example`.

Revise as configurações de banco de dados, servidor e envio de e-mails antes de executar a aplicação.

**Importante:** nunca compartilhe arquivos `.env` ou credenciais privadas.

### 5. Executar em desenvolvimento

```bash
npm run dev
```

### 6. Executar em produção

```bash
npm start
```

## 📜 Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm start` | Inicia o servidor |
| `npm run dev` | Inicia em modo desenvolvimento |
| `npm run seed` | Executa a rotina de inicialização de dados |
| `npm run check` | Executa verificações do projeto |
| `npm run mobile:init` | Inicializa a integração mobile |
| `npm run mobile:android` | Adiciona a plataforma Android |
| `npm run mobile:sync` | Sincroniza arquivos mobile |
| `npm run mobile:open` | Abre o projeto Android |

## 📱 Aplicativo mobile

O projeto possui integração com Capacitor, permitindo preparar uma versão mobile da aplicação.

Os comandos disponíveis incluem a inicialização, sincronização e abertura do projeto Android.

## 🚀 Publicação

A aplicação possui integração com a Vercel para hospedagem e publicação.

Para informações adicionais sobre implantação, consulte:

`DEPLOY_VERCEL.md`

## 🔒 Segurança

A segurança das informações é uma prioridade no desenvolvimento do Master League Online.

- Não armazene credenciais diretamente no código.
- Utilize variáveis de ambiente.
- Proteja as informações dos participantes.
- Utilize conexões HTTPS em produção.
- Mantenha as dependências atualizadas.

## 🗺️ Evolução do projeto

O Master League Online é um projeto em desenvolvimento contínuo.

A ideia é ampliar gradualmente suas funcionalidades, aprimorar a automação dos campeonatos e proporcionar uma experiência cada vez mais completa para os participantes.

## 👨‍💻 Desenvolvedor

**Guiih1034**

Desenvolvimento e manutenção do Master League Online.

- GitHub: https://github.com/Guiih1034

## 📄 Licença

Este projeto está licenciado sob a licença MIT.

Consulte o arquivo [LICENSE](LICENSE) para obter mais informações.

---

<p align="center">
  ⚽ <strong>Master League Online</strong>
  <br>
  Sua liga. Suas regras. Sua história.
</p>

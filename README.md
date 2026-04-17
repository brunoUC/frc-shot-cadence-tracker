# FRC Shot Cadence Tracker

Ferramenta web para registrar vídeos e dados de cadência de tiros do robô FRC.

## Setup em 5 passos

### 1. Criar projeto Firebase
1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **Add project** e siga o wizard
3. No menu lateral: **Build → Firestore Database → Create database**
   - Escolha **Start in test mode** (permite leitura/escrita pública)
   - Selecione a região mais próxima
4. No menu lateral: **Build → Storage → Get started**
   - Também escolha **Test mode**

### 2. Registrar o app web
1. Em **Project Settings** (engrenagem no topo) → **Your apps** → ícone `</>`
2. Dê um nome ao app e clique em **Register app**
3. Copie o objeto `firebaseConfig` exibido

### 3. Configurar o projeto
Abra `firebase-config.js` e substitua os valores:

```js
export const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "seu-projeto.firebaseapp.com",
  projectId:         "seu-projeto",
  storageBucket:     "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123"
};
```

### 4. Publicar no GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

Depois: **Settings → Pages → Source: Deploy from branch → main / root** → Save

O site ficará disponível em `https://SEU_USUARIO.github.io/SEU_REPO/`

### 5. Regras do Firebase (opcional, mais seguro)
Se quiser restringir por domínio no futuro, ajuste as regras no console.
Por ora, o **Test mode** permite acesso aberto a qualquer pessoa com o link.

---

## Funcionalidades

- Upload de vídeos curtos (até 200 MB) com drag & drop
- Cálculo automático de BPS (bolas por segundo)
- Agrupamento automático por motor + redução com média do grupo
- Filtros por motor e redução
- Reprodução de vídeo inline e em modal
- Exclusão de amostras (remove vídeo do Storage também)
- Acesso público — qualquer pessoa com o link pode adicionar e excluir amostras

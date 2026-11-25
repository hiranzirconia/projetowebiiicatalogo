import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import favoritos from "./favoritos.js";
import cors from "cors";

//import do google
import passport from "passport";
import session from "express-session";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

dotenv.config();


const app = express();
const PORT = 3000;

app.use(cors()); // talvez mudar dps

app.use(express.json());
app.use(express.urlencoded({extended: true})); // nao sei

app.use(express.static("public")); // importante n sei pra q
app.use(express.static("frontend")); // serve o frontend (HTML/CSS/JS)

app.use(session({
    secret: process.env.SESSION_SECRET || "your-session-secret",
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
})) //tratamento do login com google

app.use(passport.initialize());
app.use(passport.session());

passport.use(
    new GoogleStrategy(
     {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/callback" 
     },
     (acessToken, refresh, profile, done)=> {
        return done(null, profile);
     }

   )  
);

passport.serializeUser((user,done) => done(null,user));
passport.deserializeUser((user,done) => done(null,user));



const connetDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("DEU BOA");
    }
        catch (error){
            console.log ('DEU RUIM', error);
            
        }
    
};

connetDB();

//CREATE /favoritos
// A lógica nova está no final do arquivo (função criarFavorito).
app.post("/favoritos", requireAuth, criarFavorito);
app.get("/api/search", async (req, res) => {
    try {
        const { termo } = req.query;

        const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&entity=song&limit=10`);
        const data = await response.json();

        const resultados = data.results.map((musica) => ({
            musicaId: musica.trackId,
            titulo: musica.trackName,
            artista: musica.artistName,
            album: musica.collectionName,
            capa: musica.artworkUrl100
        }));

        res.json(resultados);
    } catch (error) {
        res.json({ error: error });
    }
});

// LISTAR /favoritos
// A lógica nova está no final do arquivo (função listarFavoritos).
app.get('/favoritos', requireAuth, listarFavoritos);


app.get('/', (req,res) =>{
    if (req.query.login === "success"){
        res.send("Login efetuado com sucesso!");

    } else{
        res.send('<a href="/auth/google">Login com google');
    }
});

app.get("/auth/google", passport.authenticate("google", {scope:["profile", "email"]}))
app.get("/auth/google/callback",
    passport.authenticate("google", {failureRedirect: "/"}),
    (req, res) => {
        res.redirect("/?login=success"); //REDIRECIONAR
    }
);

//ACCESAR DADOS DO PERFIL DO GOOGLE
app.get("/api/profile", (req, res) => {
if (req.isAuthenticated()){
    res.json({
        success: true,
        user: {
            id: req.user.id,
            displayName: req.user.displayName,
            email: req.user.emails[0].value,
            photo: req.user.photos[0].value
        }
    });
    
}else {
        res.status(401).json({ success: false, message: "Não autorizado" });
    }
});

// LOGOUT
// A lógica nova está no final do arquivo (função fazerLogout).
app.get("/api/logout", fazerLogout);

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        authenticated: req.isAuthenticated() ? {
            id: req.user.id,
            displayName:req.user.displayName,
            email: req.user.emails[0].value,
            photo: req.user.photos[0].value
        } : null
    })
})

app.listen(PORT, () => console.log(`TA FUNCIONANDO AAAA http://localhost:${PORT}`));


// ============================================================================
// CÓDIGO NOVO — favoritos por usuário e logout
// As rotas acima chamam estas funções. O JavaScript "iça" declarações feitas
// com "function" para o topo do arquivo, por isso podem ficar no final.
// ============================================================================

function requireAuth(req, res, next) {
    if (req.isAuthenticated() && req.user?.id) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: "Você precisa entrar com o Google para continuar."
    });
}

async function criarFavorito(req, res) {
    try {
        const { musicaId, titulo, artista, album = "", capa = "" } = req.body || {};

        if (!musicaId || !titulo || !artista) {
            return res.status(400).json({
                success: false,
                message: "Dados da música incompletos."
            });
        }

        const favorito = await favoritos.findOneAndUpdate(
            { userId: req.user.id, musicaId },
            {
                $setOnInsert: {
                    userId: req.user.id,
                    musicaId,
                    titulo,
                    artista,
                    album,
                    capa
                }
            },
            { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
        );

        return res.status(201).json(favorito);
    } catch (error) {
        console.error("Erro ao salvar favorito:", error);
        return res.status(500).json({
            success: false,
            message: "Não foi possível salvar o favorito."
        });
    }
}

async function listarFavoritos(req, res) {
    try {
        const listaFavoritos = await favoritos
            .find({ userId: req.user.id })
            .sort({ criadoEm: -1 });

        return res.json(listaFavoritos);
    } catch (error) {
        console.error("Erro ao listar favoritos:", error);
        return res.status(500).json({
            success: false,
            message: "Não foi possível listar os favoritos."
        });
    }
}

function fazerLogout(req, res, next) {
    req.logout((error) => {
        if (error) return next(error);

        req.session.destroy((sessionError) => {
            if (sessionError) return next(sessionError);

            res.clearCookie("connect.sid");
            return res.json({ success: true, message: "Saiu com sucesso." });
        });
    });
}
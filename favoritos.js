import mongoose, { mongo } from "mongoose";

const FavoritoSchema = new mongoose.Schema({
  userId: {type: String, required: true},
  musicaId: {type: String, required: true},
  titulo: {type: String, required: true},
  artista: {type: String, required: true},
  album: {type: String, default: ""},
  capa: {type: String, default: ""},
  criadoEm: {type: Date, default: Date.now}
});

// Impede que a mesma música seja favoritada duas vezes pelo mesmo usuário.
FavoritoSchema.index({ userId: 1, musicaId: 1 }, { unique: true });

export default mongoose.model("Favorito", FavoritoSchema);
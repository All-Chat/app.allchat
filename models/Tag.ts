import mongoose from "mongoose";

const TagSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    index: true 
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

export default mongoose.models.Tag ||
  mongoose.model("Tag", TagSchema);

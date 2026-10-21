import mongoose from 'mongoose'
import { config } from './config.js'

export async function connectDB() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 })
  const { host, name } = mongoose.connection
  console.log(`MongoDB connected — database "${name}" on ${host}`)
  return mongoose.connection
}

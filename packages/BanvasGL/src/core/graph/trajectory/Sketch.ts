import { GRAPHTYPE } from "@/constants";
import DenseTrajectory from "./DenseTrajectory";

export default class Sketch extends DenseTrajectory{
    public type: GRAPHTYPE = GRAPHTYPE.SKETCH;
}